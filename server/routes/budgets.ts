import { Router } from 'express';
import { getDatabase, syncBudgetAllocationsForMonth, notifyPartner } from '../db.js';
import { AuthRequest } from '../auth.js';
import { budgetUpdateSchema, validate, validateMonthParam, BudgetInput } from '../validation.js';

interface BudgetRow {
  id: number;
  month: string;
  shared_available: number;
  personal_samuel: number;
  personal_maria: number;
}

interface CategoryBudgetRow {
  category: string;
  amount: number;
  context: string;
}

const router = Router();
const defaultBudgetResponse = {
  shared_available: 2000,
  personal_samuel: 500,
  personal_maria: 500,
};

const getLegacyPersonKey = (user: { username?: string; email?: string | null } | undefined) => {
  const identity = `${user?.username ?? ''} ${user?.email ?? ''}`.toLowerCase();
  return identity.includes('maria') || identity.includes('mara') ? 'maria' : 'samuel';
};

const getPersonalBudgetForUser = (budget: BudgetRow | typeof defaultBudgetResponse, user: { username?: string; email?: string | null }): number =>
  getLegacyPersonKey(user) === 'maria' ? budget.personal_maria : budget.personal_samuel;

// Get the most recent month that has a budget
router.get('/latest-month', async (req: AuthRequest, res) => {
  try {
    const db = getDatabase();
    const row = await db.get<{ month: string }>('SELECT month FROM budgets ORDER BY month DESC LIMIT 1');
    res.json({ month: row?.month ?? null });
  } catch (error) {
    res.status(500).json({ error: 'Failed to fetch latest budget month' });
  }
});

// Get budget — supports month (legacy) or cycle_id (cycle-based)
router.get('/', async (req: AuthRequest, res) => {
  const month = req.query.month as string | undefined;
  const cycleId = req.query.cycle_id ? Number(req.query.cycle_id) : undefined;

  if (!month && !cycleId) {
    return res.status(400).json({ error: 'Either month or cycle_id is required' });
  }

  try {
    const db = getDatabase();
    let budget: BudgetRow | undefined;
    if (cycleId) {
      budget = await db.get<BudgetRow>('SELECT * FROM budgets WHERE cycle_id = ?', cycleId);
    }
    if (!budget && month) {
      budget = await db.get<BudgetRow>('SELECT * FROM budgets WHERE month = ?', month);
    }
    const budgetContext = (req.query.context as string) === 'personal' ? 'personal' : 'shared';
    let categoryBudgets: CategoryBudgetRow[];
    if (cycleId) {
      categoryBudgets = await db.all<CategoryBudgetRow[]>('SELECT * FROM category_budgets WHERE cycle_id = ? AND context = ?', cycleId, budgetContext);
      if (categoryBudgets.length === 0 && month) {
        categoryBudgets = await db.all<CategoryBudgetRow[]>('SELECT * FROM category_budgets WHERE month = ? AND context = ?', month, budgetContext);
      }
    } else {
      categoryBudgets = await db.all<CategoryBudgetRow[]>('SELECT * FROM category_budgets WHERE month = ? AND context = ?', month, budgetContext);
    }
    const pendingApproval = await db.get(`
      SELECT ba.*, au.username as requested_by_username 
      FROM budget_approvals ba
      JOIN app_users au ON ba.requested_by_user_id = au.id
      WHERE ba.budget_id = ? AND ba.status = 'pending'
    `, budget?.id);
    
    const response: BudgetRow | (typeof defaultBudgetResponse & { month: string; id?: undefined }) = budget || {
      month: month || '',
      ...defaultBudgetResponse
    };

    res.json({
      id: response.id,
      month: response.month,
      shared_available: response.shared_available,
      personal_budget: getPersonalBudgetForUser(response, req.user!),
      pending_approval: pendingApproval,
      categories: categoryBudgets.reduce((acc: Record<string, number>, b: CategoryBudgetRow) => {
        acc[b.category] = b.amount;
        return acc;
      }, {} as Record<string, number>)
    });
  } catch (error) {
    console.error('Error fetching budget:', error);
    res.status(500).json({ error: 'Failed to fetch budget' });
  }
});

// Update budget (personal or request shared change)
router.put('/', async (req: AuthRequest, res) => {
  const { month, shared_available, personal_budget, categories, context: budgetContext, cycle_id } = req.body;
  const username = req.user!.username;

  if (!month && !cycle_id) {
    return res.status(400).json({ error: 'Either month or cycle_id is required' });
  }

  try {
    const db = getDatabase();
    let budget: any;
    if (cycle_id) {
      budget = await db.get('SELECT * FROM budgets WHERE cycle_id = ?', cycle_id);
    }
    if (!budget && month) {
      budget = await db.get('SELECT * FROM budgets WHERE month = ?', month);
    }

    if (!budget) {
      const result = await db.run(`
        INSERT INTO budgets (month, shared_available, personal_samuel, personal_maria, cycle_id)
        VALUES (?, ?, ?, ?, ?)
      `, month || '', defaultBudgetResponse.shared_available, defaultBudgetResponse.personal_samuel, defaultBudgetResponse.personal_maria, cycle_id || null);
      budget = await db.get('SELECT * FROM budgets WHERE id = ?', result.lastID);
    }

    // Handle personal budget update (direct)
    if (personal_budget !== undefined) {
      const field = username === 'samuel' ? 'personal_samuel' : 'personal_maria';
      await db.run(`UPDATE budgets SET ${field} = ? WHERE id = ?`, personal_budget, budget.id);
    }

    // Handle shared_available update (requires approval)
    if (shared_available !== undefined && shared_available !== budget.shared_available) {
      // Check if there is already a pending approval
      const existingPending = await db.get<{ id: number }>('SELECT id FROM budget_approvals WHERE budget_id = ? AND status = "pending"', budget.id);
      let approvalId = existingPending?.id ?? null;

      if (existingPending) {
        await db.run('UPDATE budget_approvals SET shared_available = ?, requested_by_user_id = ? WHERE id = ?', 
          shared_available, req.user!.id, existingPending.id);
      } else {
        const insertResult = await db.run(`
          INSERT INTO budget_approvals (budget_id, requested_by_user_id, shared_available)
          VALUES (?, ?, ?)
        `, budget.id, req.user!.id, shared_available);
        approvalId = insertResult.lastID ?? null;
      }

      await notifyPartner(req.user!.id, username, 'budget_change_requested', 'Cambio de presupuesto',
        `{name} solicita cambiar el presupuesto a €${shared_available}`,
        { approval_id: approvalId, requested_by_user_id: req.user!.id, requested_by_username: username, shared_available });
    }

    // Update category budgets (scoped by context)
    if (categories && typeof categories === 'object') {
      const ctx = budgetContext || 'shared';
      const householdId = (await db.get<{ household_id: number }>('SELECT household_id FROM app_users WHERE id = ?', req.user!.id))?.household_id;
      for (const [category, amount] of Object.entries(categories)) {
        const ownerUserId = ctx === 'personal' ? req.user!.id : null;
        if (cycle_id) {
          // Cycle-based: upsert by cycle_id
          const existing = await db.get(
            'SELECT id FROM category_budgets WHERE cycle_id = ? AND category = ? AND context = ? AND owner_user_id IS ?',
            cycle_id, category, ctx, ownerUserId
          );
          if (existing) {
            await db.run('UPDATE category_budgets SET amount = ? WHERE id = ?', amount, existing.id);
          } else {
            await db.run(
              'INSERT INTO category_budgets (month, category, amount, context, owner_user_id, cycle_id) VALUES (?, ?, ?, ?, ?, ?)',
              month || '', category, amount, ctx, ownerUserId, cycle_id
            );
          }
        } else {
          // Manual upsert: ON CONFLICT doesn't match NULL owner_user_id in SQLite
          const existing = await db.get(
            'SELECT id FROM category_budgets WHERE month = ? AND category = ? AND context = ? AND owner_user_id IS ?',
            month, category, ctx, ownerUserId
          );
          if (existing) {
            await db.run('UPDATE category_budgets SET amount = ? WHERE id = ?', amount, existing.id);
          } else {
            await db.run(
              'INSERT INTO category_budgets (month, category, amount, context, owner_user_id) VALUES (?, ?, ?, ?, ?)',
              month, category, amount, ctx, ownerUserId
            );
          }
        }
      }
    }

    if (month) await syncBudgetAllocationsForMonth(month);
    res.json({ success: true, pending_approval: shared_available !== undefined && shared_available !== budget.shared_available });
  } catch (error) {
    console.error('Error updating budget:', error);
    res.status(500).json({ error: 'Failed to update budget' });
  }
});

// Approve shared budget change
router.post('/approve', async (req: AuthRequest, res) => {
  const { approval_id } = req.body;
  if (!approval_id) return res.status(400).json({ error: 'approval_id is required' });

  try {
    const db = getDatabase();
    const approval = await db.get('SELECT * FROM budget_approvals WHERE id = ? AND status = "pending"', approval_id);
    
    if (!approval) return res.status(404).json({ error: 'Pending approval not found' });
    if (approval.requested_by_user_id === req.user!.id) {
      return res.status(403).json({ error: 'You cannot approve your own request' });
    }

    await db.exec('BEGIN TRANSACTION');
    
    // Update the main budget
    await db.run('UPDATE budgets SET shared_available = ? WHERE id = ?', approval.shared_available, approval.budget_id);
    
    // Mark as approved
    await db.run('UPDATE budget_approvals SET status = "approved", approved_by_user_id = ? WHERE id = ?', req.user!.id, approval_id);
    
    await db.exec('COMMIT');

    await notifyPartner(req.user!.id, req.user!.username, 'budget_approved', 'Presupuesto aprobado',
      `{name} aprobó el cambio de presupuesto a €${approval.shared_available}`,
      { approval_id: approval_id, shared_available: approval.shared_available });

    res.json({ success: true });
  } catch (error) {
    const db = getDatabase();
    await db.exec('ROLLBACK');
    console.error('Error approving budget:', error);
    res.status(500).json({ error: 'Failed to approve budget' });
  }
});

export default router;

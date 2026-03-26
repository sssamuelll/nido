import { Router } from 'express';
import { createNotification, getDatabase, syncBudgetAllocationsForMonth } from '../db.js';
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

const getPersonalBudgetForUser = (budget: BudgetRow | typeof defaultBudgetResponse, username: string): number =>
  username === 'maria' ? budget.personal_maria : budget.personal_samuel;

// Get budget for a specific month
router.get('/', validateMonthParam, async (req: AuthRequest, res) => {
  const month = req.validatedMonth as string;
  
  try {
    const db = getDatabase();
    const budget = await db.get<BudgetRow>('SELECT * FROM budgets WHERE month = ?', month);
    const budgetContext = (req.query.context as string) === 'personal' ? 'personal' : 'shared';
    const categoryBudgets = await db.all<CategoryBudgetRow[]>('SELECT * FROM category_budgets WHERE month = ? AND context = ?', month, budgetContext);
    const pendingApproval = await db.get(`
      SELECT ba.*, au.username as requested_by_username 
      FROM budget_approvals ba
      JOIN app_users au ON ba.requested_by_user_id = au.id
      WHERE ba.budget_id = ? AND ba.status = 'pending'
    `, budget?.id);
    
    const response: BudgetRow | (typeof defaultBudgetResponse & { month: string; id?: undefined }) = budget || {
      month,
      ...defaultBudgetResponse
    };

    res.json({
      id: response.id,
      month: response.month,
      shared_available: response.shared_available,
      personal_budget: getPersonalBudgetForUser(response, req.user!.username),
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
router.put('/', validate(budgetUpdateSchema), async (req: AuthRequest, res) => {
  const { month, shared_available, personal_budget, categories, context: budgetContext } = req.validatedData as BudgetInput;
  const username = req.user!.username;

  try {
    const db = getDatabase();
    let budget = await db.get('SELECT * FROM budgets WHERE month = ?', month);
    
    if (!budget) {
      const result = await db.run(`
        INSERT INTO budgets (month, shared_available, personal_samuel, personal_maria)
        VALUES (?, ?, ?, ?)
      `, month, defaultBudgetResponse.shared_available, defaultBudgetResponse.personal_samuel, defaultBudgetResponse.personal_maria);
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

      try {
        const requesterDisplayName = username === 'maria' ? 'María' : 'Samuel';
        const requester = await db.get<{ household_id: string }>(
          'SELECT household_id FROM app_users WHERE id = ?',
          req.user!.id,
        );
        const otherUser = requester
          ? await db.get<{ id: number }>(
              'SELECT id FROM app_users WHERE household_id = ? AND id != ?',
              requester.household_id,
              req.user!.id,
            )
          : null;

        if (requester && otherUser) {
          await createNotification({
            household_id: String(requester.household_id),
            recipient_user_id: otherUser.id,
            type: 'budget_change_requested',
            title: 'Cambio de presupuesto',
            body: `${requesterDisplayName} solicita cambiar el presupuesto a €${shared_available}`,
            metadata: {
              approval_id: approvalId,
              requested_by_user_id: req.user!.id,
              requested_by_username: username,
              requested_for_user_id: otherUser.id,
              shared_available,
            },
          });
        }
      } catch (notifErr) {
        console.error('Error creating budget approval notification:', notifErr);
      }
    }

    // Update category budgets (scoped by context)
    if (categories && typeof categories === 'object') {
      const ctx = budgetContext || 'shared';
      const householdId = (await db.get<{ household_id: number }>('SELECT household_id FROM app_users WHERE id = ?', req.user!.id))?.household_id;
      for (const [category, amount] of Object.entries(categories)) {
        await db.run(`
          INSERT INTO category_budgets (month, category, amount, context)
          VALUES (?, ?, ?, ?)
          ON CONFLICT(month, category, context) DO UPDATE SET amount = excluded.amount
        `, month, category, amount, ctx);

        // Auto-register category if it doesn't exist
        if (householdId) {
          await db.run(
            'INSERT OR IGNORE INTO categories (household_id, name, emoji, color) VALUES (?, ?, ?, ?)',
            [householdId, category, '📂', '#6B7280']
          );
        }
      }
    }

    await syncBudgetAllocationsForMonth(month);
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

    // Notify the requester that their budget change was approved
    try {
      const approver = await db.get<{ household_id: string }>('SELECT household_id FROM app_users WHERE id = ?', req.user!.id);
      if (approver) {
        const displayName = req.user!.username === 'maria' ? 'María' : 'Samuel';
        await createNotification({
          household_id: String(approver.household_id),
          recipient_user_id: approval.requested_by_user_id,
          type: 'budget_approved',
          title: 'Presupuesto aprobado',
          body: `${displayName} aprobó el cambio de presupuesto a €${approval.shared_available}`,
          metadata: { approval_id: approval_id, shared_available: approval.shared_available },
        });
      }
    } catch (notifErr) { console.error('Notification error:', notifErr); }

    res.json({ success: true });
  } catch (error) {
    const db = getDatabase();
    await db.exec('ROLLBACK');
    console.error('Error approving budget:', error);
    res.status(500).json({ error: 'Failed to approve budget' });
  }
});

export default router;

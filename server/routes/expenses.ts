import { Router } from 'express';
import { findAppUserIdByUsername, getDatabase, notifyPartner } from '../db.js';
import { AuthRequest } from '../auth.js';
import {
  expenseCreateSchema,
  expenseUpdateSchema,
  validate,
  validateMonthParam,
  ExpenseInput,
} from '../validation.js';

interface ExpenseRow {
  id: number;
  description: string;
  amount: number;
  category: string;
  date: string;
  paid_by: string;
  paid_by_user_id: number | null;
  type: string;
  status: string;
  created_at: string;
}

interface BudgetRow {
  id: number;
  month: string;
  total_budget?: number;
  rent?: number;
  savings?: number;
  shared_available?: number;
  personal_samuel: number;
  personal_maria: number;
}

interface CategoryBudgetRow {
  month: string;
  category: string;
  amount: number;
  context: string;
}

interface CategoryRow {
  name: string;
}

const router = Router();
const visibleExpensesWhere = `
  date LIKE ?
  AND (
    type = 'shared'
    OR paid_by_user_id = ?
    OR (paid_by_user_id IS NULL AND paid_by = ?)
  )
`;

const getPersonalBudgetForUser = (budget: Pick<BudgetRow, 'personal_samuel' | 'personal_maria'>, username: string): number =>
  username === 'maria' ? budget.personal_maria : budget.personal_samuel;

const emptyBudgetForMonth = (month: string): BudgetRow => ({
  id: 0,
  month,
  shared_available: 0,
  personal_samuel: 0,
  personal_maria: 0,
});

// Get expenses for a specific month
router.get('/', validateMonthParam, async (req: AuthRequest, res) => {
  const month = req.validatedMonth as string;
  
  try {
    const db = getDatabase();
    const expenses = await db.all(`
      SELECT * FROM expenses 
      WHERE ${visibleExpensesWhere}
      ORDER BY date DESC, created_at DESC
    `, `${month}%`, req.user!.id, req.user!.username);

    res.json(expenses);
  } catch (error) {
    console.error('Error fetching expenses:', error);
    res.status(500).json({ error: 'Failed to fetch expenses' });
  }
});

// Create new expense
router.post('/', validate(expenseCreateSchema), async (req: AuthRequest, res) => {
  const { description, amount, category, date, type, status = 'paid' } = req.validatedData as ExpenseInput;
  // Security: Force paid_by to be the current authenticated user
  const paid_by = req.user!.username;

  try {
    const db = getDatabase();
    const paidByUserId = await findAppUserIdByUsername(paid_by);
    const result = await db.run(`
      INSERT INTO expenses (description, amount, category, date, paid_by, paid_by_user_id, type, status)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?)
    `, description, amount, category, date, paid_by, paidByUserId, type, status);

    // Auto-register category if it doesn't exist
    const householdId = (await db.get<{ household_id: number }>('SELECT household_id FROM app_users WHERE id = ?', req.user!.id))?.household_id;
    if (householdId && category) {
      await db.run(
        'INSERT OR IGNORE INTO categories (household_id, name, emoji, color) VALUES (?, ?, ?, ?)',
        [householdId, category, '📂', '#6B7280']
      );
    }

    const newExpense = await db.get('SELECT * FROM expenses WHERE id = ?', result.lastID);

    if (type === 'shared') {
      await notifyPartner(req.user!.id, req.user!.username, 'expense_added', 'Nuevo gasto',
        `{name} añadió €${amount} en ${category}`, { expense_id: result.lastID });
    }

    res.status(201).json(newExpense);
  } catch (error) {
    console.error('Error creating expense:', error);
    res.status(500).json({ error: 'Failed to create expense' });
  }
});

// Update expense
router.put('/:id', validate(expenseUpdateSchema), async (req: AuthRequest, res) => {
  const { id } = req.params;
  const validatedData = req.validatedData as ExpenseInput;

  try {
    const db = getDatabase();
    const existing = await db.get<ExpenseRow>('SELECT * FROM expenses WHERE id = ?', id);
    if (!existing) {
      return res.status(404).json({ error: 'Expense not found' });
    }

    // Security check: Only allow editing if it's a shared expense OR if the user is the owner
    const isOwner = existing.paid_by === req.user!.username;
    const isShared = existing.type === 'shared';

    if (!isShared && !isOwner) {
      return res.status(403).json({ error: 'Forbidden: You can only edit your own personal expenses' });
    }

    // Security: Do not allow changing the 'paid_by' field once created
    const { paid_by: _, ...safeData } = validatedData;
    const updated = { ...existing, ...safeData };

    await db.run(`
      UPDATE expenses 
      SET description = ?, amount = ?, category = ?, date = ?, paid_by = ?, type = ?, status = ?
      WHERE id = ?
    `, updated.description, updated.amount, updated.category, updated.date, updated.paid_by, updated.type, updated.status, id);

    const updatedExpense = await db.get('SELECT * FROM expenses WHERE id = ?', id);

    if (updated.type === 'shared') {
      await notifyPartner(req.user!.id, req.user!.username, 'expense_updated', 'Gasto editado',
        `{name} editó "${updated.description}" (€${updated.amount})`, { expense_id: Number(id) });
    }

    res.json(updatedExpense);
  } catch (error) {
    console.error('Error updating expense:', error);
    res.status(500).json({ error: 'Failed to update expense' });
  }
});

// Delete expense
router.delete('/:id', async (req: AuthRequest, res) => {
  const { id } = req.params;

  try {
    const db = getDatabase();
    const existing = await db.get('SELECT * FROM expenses WHERE id = ?', id);
    
    if (!existing) {
      return res.status(404).json({ error: 'Expense not found' });
    }

    // Security check: Only allow deleting if it's a shared expense OR if the user is the owner
    const isOwner = existing.paid_by === req.user!.username;
    const isShared = existing.type === 'shared';

    if (!isShared && !isOwner) {
      return res.status(403).json({ error: 'Forbidden: You can only delete your own personal expenses' });
    }

    if (isShared) {
      await notifyPartner(req.user!.id, req.user!.username, 'expense_deleted', 'Gasto eliminado',
        `{name} eliminó "${existing.description}" (€${existing.amount})`, { category: existing.category });
    }

    await db.run('DELETE FROM expenses WHERE id = ?', id);
    res.status(204).send();
  } catch (error) {
    console.error('Error deleting expense:', error);
    res.status(500).json({ error: 'Failed to delete expense' });
  }
});

// Get dashboard summary
router.get('/summary', validateMonthParam, async (req: AuthRequest, res) => {
  const month = req.validatedMonth as string;
  
  try {
    const db = getDatabase();
    
    // Get budget for the month. If none exists yet, return a safe empty-state summary
    // so the dashboard can load before the first production budget is configured.
    const storedBudget = await db.get<BudgetRow>('SELECT * FROM budgets WHERE month = ?', month);
    const budget = storedBudget ?? emptyBudgetForMonth(month);

    // Support both legacy and current budget schemas.
    const availableShared = typeof budget.shared_available === 'number'
      ? budget.shared_available
      : (budget.total_budget ?? 0) - (budget.rent ?? 0) - (budget.savings ?? 0) - budget.personal_samuel - budget.personal_maria;

    // Get expenses visible to the current user for the month
    const expenses = await db.all<ExpenseRow[]>(
      `SELECT * FROM expenses WHERE ${visibleExpensesWhere}`,
      `${month}%`,
      req.user!.id,
      req.user!.username
    );

    // Calculate totals
    const totalSpent = expenses.reduce((sum: number, exp: ExpenseRow) => sum + exp.amount, 0);
    const sharedExpenses = expenses.filter((exp: ExpenseRow) => exp.type === 'shared');
    const totalSharedSpent = sharedExpenses.reduce((sum: number, exp: ExpenseRow) => sum + exp.amount, 0);

    // Calculate who owes whom
    const samuelPaid = sharedExpenses
      .filter((exp: ExpenseRow) => exp.paid_by === 'samuel')
      .reduce((sum: number, exp: ExpenseRow) => sum + exp.amount, 0);

    const mariaPaid = sharedExpenses
      .filter((exp: ExpenseRow) => exp.paid_by === 'maria')
      .reduce((sum: number, exp: ExpenseRow) => sum + exp.amount, 0);

    const halfShared = totalSharedSpent / 2;
    const samuelBalance = samuelPaid - halfShared;
    const mariaBalance = mariaPaid - halfShared;

    // Category breakdown with budgets (scoped by context)
    const allCategoryBudgets = await db.all<CategoryBudgetRow[]>('SELECT * FROM category_budgets WHERE month = ?', month);
    const sharedBudgets = allCategoryBudgets.filter(b => b.context === 'shared');
    const personalBudgets = allCategoryBudgets.filter(b => b.context === 'personal');
    const householdCategories = await db.all<CategoryRow[]>(
      'SELECT name FROM categories WHERE household_id = (SELECT household_id FROM app_users WHERE id = ?) ORDER BY name',
      req.user!.id,
    );

    const categoryNames = Array.from(new Set(
      [
        ...householdCategories.map((category) => category.name),
        ...allCategoryBudgets.map((budget) => budget.category),
        ...expenses.map((expense) => expense.category),
      ].filter((category): category is string => Boolean(category))
    ));

    const visibleCategoryNames = categoryNames;

    const buildBreakdown = (budgets: CategoryBudgetRow[], filteredExpenses: ExpenseRow[]) =>
      visibleCategoryNames.map(category => {
        const catExpenses = filteredExpenses.filter((exp: ExpenseRow) => exp.category === category);
        const catTotal = catExpenses.reduce((sum: number, exp: ExpenseRow) => sum + exp.amount, 0);
        const budgetEntry = budgets.find((b: CategoryBudgetRow) => b.category === category);
        return {
          category,
          total: catTotal,
          budget: budgetEntry ? budgetEntry.amount : 0,
          count: catExpenses.length
        };
      });

    const userPersonalExpenses = expenses.filter((exp: ExpenseRow) => exp.type === 'personal' && exp.paid_by === req.user!.username);

    const categoryBreakdown = buildBreakdown(sharedBudgets, sharedExpenses);
    const personalCategoryBreakdown = buildBreakdown(personalBudgets, userPersonalExpenses);

    // Recent transactions (last 5)
    const recentTransactions = expenses
      .sort((a: ExpenseRow, b: ExpenseRow) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime())
      .slice(0, 5);

    // Personal spending visible to the current user
    const personalSpent = expenses
      .filter((exp: ExpenseRow) => exp.paid_by === req.user!.username && exp.type === 'personal')
      .reduce((sum: number, exp: ExpenseRow) => sum + exp.amount, 0);
    const personalBudget = getPersonalBudgetForUser(budget, req.user!.username);

    res.json({
      budget: {
        total: budget.total_budget ?? 0,
        rent: budget.rent ?? 0,
        savings: budget.savings ?? 0,
        personal: personalBudget,
        availableShared
      },
      spending: {
        totalSpent,
        totalSharedSpent,
        remainingShared: availableShared - totalSharedSpent
      },
      personal: {
        owner: req.user!.username,
        spent: personalSpent,
        budget: personalBudget
      },
      categoryBreakdown,
      personalCategoryBreakdown,
      recentTransactions
    });
  } catch (error) {
    console.error('Error fetching summary:', error);
    res.status(500).json({ error: 'Failed to fetch summary' });
  }
});

// Get distinct categories used
router.get('/categories', async (_req: AuthRequest, res) => {
  try {
    const db = getDatabase();
    const rows = await db.all<{ category: string }[]>(
      `SELECT DISTINCT category FROM expenses ORDER BY category`
    );
    res.json(rows.map(r => r.category));
  } catch (error) {
    console.error('Error fetching categories:', error);
    res.status(500).json({ error: 'Failed to fetch categories' });
  }
});

export default router;

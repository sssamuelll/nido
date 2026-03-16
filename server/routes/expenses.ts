import { Router } from 'express';
import { findAppUserIdByUsername, getDatabase } from '../db.js';
import { AuthRequest } from '../auth.js';
import { 
  expenseCreateSchema, 
  expenseUpdateSchema, 
  validate, 
  validateMonthParam 
} from '../validation.js';

const router = Router();
const visibleExpensesWhere = `
  date LIKE ?
  AND (
    type = 'shared'
    OR paid_by_user_id = ?
    OR (paid_by_user_id IS NULL AND paid_by = ?)
  )
`;

const getPersonalBudgetForUser = (budget: any, username: string) =>
  username === 'maria' ? budget.personal_maria : budget.personal_samuel;

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
  const { description, amount, category, date, type, status = 'paid' } = req.validatedData;
  // Security: Force paid_by to be the current authenticated user
  const paid_by = req.user!.username;

  try {
    const db = getDatabase();
    const paidByUserId = await findAppUserIdByUsername(paid_by);
    const result = await db.run(`
      INSERT INTO expenses (description, amount, category, date, paid_by, paid_by_user_id, type, status)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?)
    `, description, amount, category, date, paid_by, paidByUserId, type, status);

    const newExpense = await db.get('SELECT * FROM expenses WHERE id = ?', result.lastID);
    res.status(201).json(newExpense);
  } catch (error) {
    console.error('Error creating expense:', error);
    res.status(500).json({ error: 'Failed to create expense' });
  }
});

// Update expense
router.put('/:id', validate(expenseUpdateSchema), async (req: AuthRequest, res) => {
  const { id } = req.params;
  const validatedData = req.validatedData;

  try {
    const db = getDatabase();
    const existing = await db.get('SELECT * FROM expenses WHERE id = ?', id);
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
    
    // Get budget for the month
    const budget = await db.get('SELECT * FROM budgets WHERE month = ?', month);
    
    if (!budget) {
      return res.status(404).json({ error: 'Budget not found for this month' });
    }

    // Calculate available for shared expenses
    const availableShared = budget.total_budget - budget.rent - budget.savings - budget.personal_samuel - budget.personal_maria;

    // Get expenses visible to the current user for the month
    const expenses = await db.all(
      `SELECT * FROM expenses WHERE ${visibleExpensesWhere}`,
      `${month}%`,
      req.user!.id,
      req.user!.username
    );

    // Calculate totals
    const totalSpent = expenses.reduce((sum: number, exp: any) => sum + exp.amount, 0);
    const sharedExpenses = expenses.filter((exp: any) => exp.type === 'shared');
    const totalSharedSpent = sharedExpenses.reduce((sum: number, exp: any) => sum + exp.amount, 0);

    // Calculate who owes whom
    const samuelPaid = sharedExpenses
      .filter((exp: any) => exp.paid_by === 'samuel')
      .reduce((sum: number, exp: any) => sum + exp.amount, 0);
    
    const mariaPaid = sharedExpenses
      .filter((exp: any) => exp.paid_by === 'maria')
      .reduce((sum: number, exp: any) => sum + exp.amount, 0);

    const halfShared = totalSharedSpent / 2;
    const samuelBalance = samuelPaid - halfShared;
    const mariaBalance = mariaPaid - halfShared;

    // Category breakdown with budgets
    const categories = ['Restaurant', 'Gastos', 'Servicios', 'Ocio', 'Inversión', 'Otros'];
    const categoryBudgets = await db.all('SELECT * FROM category_budgets WHERE month = ?', month);
    
    const categoryBreakdown = categories.map(category => {
      const categoryExpenses = expenses.filter((exp: any) => exp.category === category);
      const categoryTotal = categoryExpenses.reduce((sum: number, exp: any) => sum + exp.amount, 0);
      const budgetEntry = categoryBudgets.find(b => b.category === category);
      
      return {
        category,
        total: categoryTotal,
        budget: budgetEntry ? budgetEntry.amount : 0,
        count: categoryExpenses.length
      };
    });

    // Recent transactions (last 5)
    const recentTransactions = expenses
      .sort((a: any, b: any) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime())
      .slice(0, 5);

    // Personal spending visible to the current user
    const personalSpent = expenses
      .filter((exp: any) => exp.paid_by === req.user!.username && exp.type === 'personal')
      .reduce((sum: number, exp: any) => sum + exp.amount, 0);
    const personalBudget = getPersonalBudgetForUser(budget, req.user!.username);

    res.json({
      budget: {
        total: budget.total_budget,
        rent: budget.rent,
        savings: budget.savings,
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

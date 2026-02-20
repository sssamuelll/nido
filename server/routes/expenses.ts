import { Router } from 'express';
import { getDatabase } from '../db.js';
import { AuthRequest } from '../auth.js';

const router = Router();

// Get expenses for a specific month
router.get('/', async (req: AuthRequest, res) => {
  const { month } = req.query;
  
  if (!month) {
    return res.status(400).json({ error: 'Month parameter is required' });
  }

  try {
    const db = getDatabase();
    const expenses = await db.all(`
      SELECT * FROM expenses 
      WHERE date LIKE ? 
      ORDER BY date DESC, created_at DESC
    `, `${month}%`);

    res.json(expenses);
  } catch (error) {
    console.error('Error fetching expenses:', error);
    res.status(500).json({ error: 'Failed to fetch expenses' });
  }
});

// Create new expense
router.post('/', async (req: AuthRequest, res) => {
  const { description, amount, category, date, paid_by, type, status = 'paid' } = req.body;

  if (!description || !amount || !category || !date || !paid_by || !type) {
    return res.status(400).json({ error: 'Missing required fields' });
  }

  if (!['samuel', 'maria'].includes(paid_by)) {
    return res.status(400).json({ error: 'Invalid paid_by value' });
  }

  if (!['shared', 'personal'].includes(type)) {
    return res.status(400).json({ error: 'Invalid type value' });
  }

  try {
    const db = getDatabase();
    const result = await db.run(`
      INSERT INTO expenses (description, amount, category, date, paid_by, type, status)
      VALUES (?, ?, ?, ?, ?, ?, ?)
    `, description, amount, category, date, paid_by, type, status);

    const newExpense = await db.get('SELECT * FROM expenses WHERE id = ?', result.lastID);
    res.status(201).json(newExpense);
  } catch (error) {
    console.error('Error creating expense:', error);
    res.status(500).json({ error: 'Failed to create expense' });
  }
});

// Update expense
router.put('/:id', async (req: AuthRequest, res) => {
  const { id } = req.params;
  const { description, amount, category, date, paid_by, type, status } = req.body;

  try {
    const db = getDatabase();
    const result = await db.run(`
      UPDATE expenses 
      SET description = ?, amount = ?, category = ?, date = ?, paid_by = ?, type = ?, status = ?
      WHERE id = ?
    `, description, amount, category, date, paid_by, type, status, id);

    if (result.changes === 0) {
      return res.status(404).json({ error: 'Expense not found' });
    }

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
    const result = await db.run('DELETE FROM expenses WHERE id = ?', id);
    
    if (result.changes === 0) {
      return res.status(404).json({ error: 'Expense not found' });
    }

    res.status(204).send();
  } catch (error) {
    console.error('Error deleting expense:', error);
    res.status(500).json({ error: 'Failed to delete expense' });
  }
});

// Get dashboard summary
router.get('/summary', async (req: AuthRequest, res) => {
  const { month } = req.query;
  
  if (!month) {
    return res.status(400).json({ error: 'Month parameter is required' });
  }

  try {
    const db = getDatabase();
    
    // Get budget for the month
    const budget = await db.get('SELECT * FROM budgets WHERE month = ?', month);
    
    if (!budget) {
      return res.status(404).json({ error: 'Budget not found for this month' });
    }

    // Calculate available for shared expenses
    const availableShared = budget.total_budget - budget.rent - budget.savings - budget.personal_samuel - budget.personal_maria;

    // Get expenses for the month
    const expenses = await db.all('SELECT * FROM expenses WHERE date LIKE ?', `${month}%`);

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

    // Category breakdown
    const categories = ['Restaurant', 'Gastos', 'Servicios', 'Ocio', 'Inversión', 'Otros'];
    const categoryBreakdown = categories.map(category => {
      const categoryExpenses = expenses.filter((exp: any) => exp.category === category);
      const categoryTotal = categoryExpenses.reduce((sum: number, exp: any) => sum + exp.amount, 0);
      return {
        category,
        total: categoryTotal,
        count: categoryExpenses.length
      };
    });

    // Recent transactions (last 5)
    const recentTransactions = expenses
      .sort((a: any, b: any) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime())
      .slice(0, 5);

    // Personal spending
    const samuelPersonal = expenses
      .filter((exp: any) => exp.paid_by === 'samuel' && exp.type === 'personal')
      .reduce((sum: number, exp: any) => sum + exp.amount, 0);
    const mariaPersonal = expenses
      .filter((exp: any) => exp.paid_by === 'maria' && exp.type === 'personal')
      .reduce((sum: number, exp: any) => sum + exp.amount, 0);

    res.json({
      budget: {
        total: budget.total_budget,
        rent: budget.rent,
        savings: budget.savings,
        personalSamuel: budget.personal_samuel,
        personalMaria: budget.personal_maria,
        availableShared
      },
      spending: {
        totalSpent,
        totalSharedSpent,
        remainingShared: availableShared - totalSharedSpent
      },
      personal: {
        samuel: { spent: samuelPersonal, budget: budget.personal_samuel },
        maria: { spent: mariaPersonal, budget: budget.personal_maria }
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
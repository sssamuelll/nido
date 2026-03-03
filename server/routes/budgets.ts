import { Router } from 'express';
import { getDatabase } from '../db.js';
import { AuthRequest } from '../auth.js';
import { budgetUpdateSchema, validate, validateMonthParam } from '../validation.js';

const router = Router();

// Get budget for a specific month
router.get('/', validateMonthParam, async (req: AuthRequest, res) => {
  const month = req.validatedMonth as string;
  
  try {
    const db = getDatabase();
    const budget = await db.get('SELECT * FROM budgets WHERE month = ?', month);
    const categoryBudgets = await db.all('SELECT * FROM category_budgets WHERE month = ?', month);
    
    const response = budget || {
      month,
      total_budget: 2800,
      rent: 335,
      savings: 300,
      personal_samuel: 500,
      personal_maria: 500
    };

    res.json({
      ...response,
      categories: categoryBudgets.reduce((acc: any, b: any) => {
        acc[b.category] = b.amount;
        return acc;
      }, {})
    });
  } catch (error) {
    console.error('Error fetching budget:', error);
    res.status(500).json({ error: 'Failed to fetch budget' });
  }
});

// Update or create budget
router.put('/', validate(budgetUpdateSchema), async (req: AuthRequest, res) => {
  const { month, total_budget, rent, savings, personal_samuel, personal_maria, categories } = req.validatedData;

  try {
    const db = getDatabase();
    
    // Update main budget
    const updateResult = await db.run(`
      UPDATE budgets 
      SET total_budget = ?, rent = ?, savings = ?, personal_samuel = ?, personal_maria = ?
      WHERE month = ?
    `, total_budget, rent, savings, personal_samuel, personal_maria, month);

    if (updateResult.changes === 0) {
      await db.run(`
        INSERT INTO budgets (month, total_budget, rent, savings, personal_samuel, personal_maria)
        VALUES (?, ?, ?, ?, ?, ?)
      `, month, total_budget, rent, savings, personal_samuel, personal_maria);
    }

    // Update category budgets if provided
    if (categories && typeof categories === 'object') {
      for (const [category, amount] of Object.entries(categories)) {
        await db.run(`
          INSERT INTO category_budgets (month, category, amount)
          VALUES (?, ?, ?)
          ON CONFLICT(month, category) DO UPDATE SET amount = excluded.amount
        `, month, category, amount);
      }
    }

    res.json({ success: true });
  } catch (error) {
    console.error('Error updating budget:', error);
    res.status(500).json({ error: 'Failed to update budget' });
  }
});

export default router;
import { Router } from 'express';
import { getDatabase, syncBudgetAllocationsForMonth } from '../db.js';
import { AuthRequest } from '../auth.js';
import { budgetUpdateSchema, validate, validateMonthParam } from '../validation.js';

const router = Router();
const defaultBudgetResponse = {
  total_budget: 2800,
  rent: 335,
  savings: 300,
  personal_samuel: 500,
  personal_maria: 500,
};

const getPersonalBudgetForUser = (budget: typeof defaultBudgetResponse, username: string) =>
  username === 'maria' ? budget.personal_maria : budget.personal_samuel;

// Get budget for a specific month
router.get('/', validateMonthParam, async (req: AuthRequest, res) => {
  const month = req.validatedMonth as string;
  
  try {
    const db = getDatabase();
    const budget = await db.get('SELECT * FROM budgets WHERE month = ?', month);
    const categoryBudgets = await db.all('SELECT * FROM category_budgets WHERE month = ?', month);
    
    const response = budget || {
      month,
      ...defaultBudgetResponse
    };

    res.json({
      month: response.month,
      total_budget: response.total_budget,
      rent: response.rent,
      savings: response.savings,
      personal_budget: getPersonalBudgetForUser(response, req.user!.username),
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
  const { month, total_budget, rent, savings, personal_budget, personal_samuel, personal_maria, categories } = req.validatedData;

  try {
    const db = getDatabase();
    const existingBudget = await db.get(
      'SELECT * FROM budgets WHERE month = ?',
      month
    );
    const baseBudget = existingBudget || { month, ...defaultBudgetResponse };
    const nextPersonalSamuel = req.user!.username === 'samuel'
      ? personal_budget ?? personal_samuel ?? baseBudget.personal_samuel
      : personal_samuel ?? baseBudget.personal_samuel;
    const nextPersonalMaria = req.user!.username === 'maria'
      ? personal_budget ?? personal_maria ?? baseBudget.personal_maria
      : personal_maria ?? baseBudget.personal_maria;
    const nextAllocationSum = rent + savings + nextPersonalSamuel + nextPersonalMaria;

    if (nextAllocationSum > total_budget) {
      return res.status(400).json({
        error: 'Total budget cannot be lower than the combined shared and personal allocations'
      });
    }
    
    // Update main budget
    const updateResult = await db.run(`
      UPDATE budgets 
      SET total_budget = ?, rent = ?, savings = ?, personal_samuel = ?, personal_maria = ?
      WHERE month = ?
    `, total_budget, rent, savings, nextPersonalSamuel, nextPersonalMaria, month);

    if (updateResult.changes === 0) {
      await db.run(`
        INSERT INTO budgets (month, total_budget, rent, savings, personal_samuel, personal_maria)
        VALUES (?, ?, ?, ?, ?, ?)
      `, month, total_budget, rent, savings, nextPersonalSamuel, nextPersonalMaria);
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

    await syncBudgetAllocationsForMonth(month);

    res.json({ success: true });
  } catch (error) {
    console.error('Error updating budget:', error);
    res.status(500).json({ error: 'Failed to update budget' });
  }
});

export default router;

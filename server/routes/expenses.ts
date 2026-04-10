import { Router } from 'express';
import { findAppUserIdByUsername, getDatabase, notifyPartner } from '../db.js';
import { AuthRequest } from '../auth.js';
import {
  expenseCreateSchema,
  expenseUpdateSchema,
  validate,
  ExpenseInput,
} from '../validation.js';

interface ExpenseRow {
  id: number;
  description: string;
  amount: number;
  category: string;
  category_id: number | null;
  date: string;
  paid_by: string;
  paid_by_user_id: number | null;
  type: string;
  status: string;
  created_at: string;
}

interface HouseholdBudgetRow {
  id: number;
  total_amount: number;
  personal_samuel: number;
  personal_maria: number;
}

interface CategoryBudgetInfo {
  id: number;
  name: string;
  budget_amount: number;
}

const router = Router();
const visibleExpensesWhereMonth = `
  date LIKE ?
  AND (
    type = 'shared'
    OR paid_by_user_id = ?
    OR (paid_by_user_id IS NULL AND paid_by = ?)
  )
`;
const visibleExpensesWhereRange = `
  date >= ?
  AND (? IS NULL OR date < ?)
  AND (
    type = 'shared'
    OR paid_by_user_id = ?
    OR (paid_by_user_id IS NULL AND paid_by = ?)
  )
`;

const getLegacyPaidBy = (user: AuthRequest['user']) => {
  const identity = `${user?.username ?? ''} ${user?.email ?? ''}`.toLowerCase();
  if (identity.includes('maria') || identity.includes('mara')) {
    return 'maria';
  }
  return 'samuel';
};

const getPersonalBudgetForUser = (budget: Pick<HouseholdBudgetRow, 'personal_samuel' | 'personal_maria'>, user: { username?: string; email?: string | null }): number =>
  getLegacyPaidBy(user as AuthRequest['user']) === 'maria' ? budget.personal_maria : budget.personal_samuel;

const isExpenseOwner = (expense: ExpenseRow, user: NonNullable<AuthRequest['user']>) =>
  expense.paid_by_user_id === user.id || expense.paid_by === user.username;

/** Resolve category_id from category name + type for a given user */
const resolveCategoryId = async (
  db: Awaited<ReturnType<typeof getDatabase>>,
  categoryName: string,
  type: string,
  householdId: number,
  userId: number
): Promise<number | null> => {
  if (type === 'shared') {
    const row = await db.get<{ id: number }>(
      `SELECT id FROM categories WHERE name = ? AND context = 'shared' AND owner_user_id IS NULL AND household_id = ?`,
      categoryName, householdId
    );
    return row?.id ?? null;
  } else {
    const row = await db.get<{ id: number }>(
      `SELECT id FROM categories WHERE name = ? AND context = 'personal' AND owner_user_id = ? AND household_id = ?`,
      categoryName, userId, householdId
    );
    return row?.id ?? null;
  }
};

// Get expenses — supports both month (legacy) and date range (cycle-based)
router.get('/', async (req: AuthRequest, res) => {
  const startDate = req.query.start_date as string | undefined;
  const endDate = req.query.end_date as string | undefined;
  const month = req.query.month as string | undefined;

  try {
    const db = getDatabase();
    let expenses;

    if (startDate) {
      expenses = await db.all(
        `SELECT * FROM expenses
         WHERE ${visibleExpensesWhereRange}
         ORDER BY date DESC, created_at DESC`,
        startDate, endDate ?? null, endDate ?? null, req.user!.id, req.user!.username
      );
    } else if (month) {
      expenses = await db.all(
        `SELECT * FROM expenses
         WHERE ${visibleExpensesWhereMonth}
         ORDER BY date DESC, created_at DESC`,
        `${month}%`, req.user!.id, req.user!.username
      );
    } else {
      // No filter: return all visible expenses
      expenses = await db.all(
        `SELECT * FROM expenses
         WHERE (type = 'shared' OR paid_by_user_id = ? OR (paid_by_user_id IS NULL AND paid_by = ?))
         ORDER BY date DESC, created_at DESC`,
        req.user!.id, req.user!.username
      );
    }

    res.json(expenses);
  } catch (error) {
    console.error('Error fetching expenses:', error);
    res.status(500).json({ error: 'Failed to fetch expenses' });
  }
});

// Create new expense
router.post('/', validate(expenseCreateSchema), async (req: AuthRequest, res) => {
  const data = req.validatedData as ExpenseInput;
  const { description, amount, date, type, status = 'paid' } = data;
  const paid_by = getLegacyPaidBy(req.user);

  try {
    const db = getDatabase();
    const paidByUserId = req.user!.id;

    // Resolve category_id
    let categoryId: number | null = data.category_id ?? null;
    let categoryName: string = data.category ?? '';

    if (categoryId && !categoryName) {
      // Look up name from id
      const catRow = await db.get<{ name: string }>('SELECT name FROM categories WHERE id = ?', categoryId);
      categoryName = catRow?.name ?? '';
    } else if (categoryName && !categoryId) {
      // Resolve id from name
      const user = await db.get<{ household_id: number }>(
        'SELECT household_id FROM app_users WHERE id = ?',
        req.user!.id
      );
      if (user) {
        categoryId = await resolveCategoryId(db, categoryName, type, user.household_id, req.user!.id);
      }
    }

    const result = await db.run(
      `INSERT INTO expenses (description, amount, category, category_id, date, paid_by, paid_by_user_id, type, status)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      description, amount, categoryName, categoryId, date, paid_by, paidByUserId, type, status
    );

    const newExpense = await db.get('SELECT * FROM expenses WHERE id = ?', result.lastID);

    if (type === 'shared') {
      await notifyPartner(req.user!.id, req.user!.username, 'expense_added', 'Nuevo gasto',
        `{name} a\u00F1adi\u00F3 \u20AC${amount} en ${categoryName}`, { expense_id: result.lastID });
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

    const isOwner = isExpenseOwner(existing, req.user!);
    const isShared = existing.type === 'shared';

    if (!isShared && !isOwner) {
      return res.status(403).json({ error: 'Forbidden: You can only edit your own personal expenses' });
    }

    // Resolve category_id if category name changed
    let categoryId = validatedData.category_id ?? existing.category_id;
    const categoryName = validatedData.category ?? existing.category;

    if (validatedData.category && !validatedData.category_id) {
      const user = await db.get<{ household_id: number }>(
        'SELECT household_id FROM app_users WHERE id = ?',
        req.user!.id
      );
      if (user) {
        categoryId = await resolveCategoryId(
          db, categoryName, validatedData.type ?? existing.type, user.household_id, req.user!.id
        );
      }
    }

    const updated = { ...existing, ...validatedData, category_id: categoryId };

    await db.run(
      `UPDATE expenses
       SET description = ?, amount = ?, category = ?, category_id = ?, date = ?, paid_by = ?, type = ?, status = ?
       WHERE id = ?`,
      updated.description, updated.amount, updated.category, updated.category_id,
      updated.date, updated.paid_by, updated.type, updated.status, id
    );

    const updatedExpense = await db.get('SELECT * FROM expenses WHERE id = ?', id);

    if (updated.type === 'shared') {
      await notifyPartner(req.user!.id, req.user!.username, 'expense_updated', 'Gasto editado',
        `{name} edit\u00F3 "${updated.description}" (\u20AC${updated.amount})`, { expense_id: Number(id) });
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
    const existing = await db.get<ExpenseRow>('SELECT * FROM expenses WHERE id = ?', id);

    if (!existing) {
      return res.status(404).json({ error: 'Expense not found' });
    }

    const isOwner = existing.paid_by === req.user!.username;
    const isShared = existing.type === 'shared';

    if (!isShared && !isOwner) {
      return res.status(403).json({ error: 'Forbidden: You can only delete your own personal expenses' });
    }

    if (isShared) {
      await notifyPartner(req.user!.id, req.user!.username, 'expense_deleted', 'Gasto eliminado',
        `{name} elimin\u00F3 "${existing.description}" (\u20AC${existing.amount})`, { category: existing.category });
    }

    await db.run('DELETE FROM expenses WHERE id = ?', id);
    res.status(204).send();
  } catch (error) {
    console.error('Error deleting expense:', error);
    res.status(500).json({ error: 'Failed to delete expense' });
  }
});

// Get dashboard summary — supports month (legacy) or date range (cycle-based)
router.get('/summary', async (req: AuthRequest, res) => {
  const startDate = req.query.start_date as string | undefined;
  const endDate = req.query.end_date as string | undefined;
  const month = req.query.month as string | undefined;

  try {
    const db = getDatabase();
    const user = await db.get<{ household_id: number }>(
      'SELECT household_id FROM app_users WHERE id = ?',
      req.user!.id
    );
    const householdId = user?.household_id;

    // Read household budget
    const householdBudget = await db.get<HouseholdBudgetRow>(
      'SELECT * FROM household_budget WHERE household_id = ?',
      householdId
    );

    const availableShared = householdBudget?.total_amount ?? 0;
    const personalBudget = householdBudget
      ? getPersonalBudgetForUser(householdBudget, req.user!)
      : 0;

    // Get expenses: date range (cycle) or month (legacy)
    let expenses: ExpenseRow[];
    if (startDate) {
      expenses = await db.all<ExpenseRow[]>(
        `SELECT * FROM expenses WHERE ${visibleExpensesWhereRange}`,
        startDate, endDate ?? null, endDate ?? null, req.user!.id, req.user!.username
      );
    } else if (month) {
      expenses = await db.all<ExpenseRow[]>(
        `SELECT * FROM expenses WHERE ${visibleExpensesWhereMonth}`,
        `${month}%`, req.user!.id, req.user!.username
      );
    } else {
      // No filter: all visible expenses
      expenses = await db.all<ExpenseRow[]>(
        `SELECT * FROM expenses
         WHERE (type = 'shared' OR paid_by_user_id = ? OR (paid_by_user_id IS NULL AND paid_by = ?))`,
        req.user!.id, req.user!.username
      );
    }

    // Calculate totals
    const totalSpent = expenses.reduce((sum, exp) => sum + exp.amount, 0);
    const sharedExpenses = expenses.filter(exp => exp.type === 'shared');
    const totalSharedSpent = sharedExpenses.reduce((sum, exp) => sum + exp.amount, 0);

    // Calculate who owes whom
    const samuelPaid = sharedExpenses
      .filter(exp => exp.paid_by === 'samuel')
      .reduce((sum, exp) => sum + exp.amount, 0);

    const mariaPaid = sharedExpenses
      .filter(exp => exp.paid_by === 'maria')
      .reduce((sum, exp) => sum + exp.amount, 0);

    const halfShared = totalSharedSpent / 2;
    const samuelBalance = samuelPaid - halfShared;
    const mariaBalance = mariaPaid - halfShared;

    // Category breakdown from categories table (budget_amount on each category)
    const sharedCategories = await db.all<CategoryBudgetInfo[]>(
      `SELECT id, name, budget_amount FROM categories
       WHERE household_id = ? AND context = 'shared' AND owner_user_id IS NULL`,
      householdId
    );
    const personalCategories = await db.all<CategoryBudgetInfo[]>(
      `SELECT id, name, budget_amount FROM categories
       WHERE household_id = ? AND context = 'personal' AND owner_user_id = ?`,
      householdId, req.user!.id
    );

    // Collect all category names including those from expenses (for uncategorized spending)
    const sharedCategoryMap = new Map(sharedCategories.map(c => [c.id, c]));
    const personalCategoryMap = new Map(personalCategories.map(c => [c.id, c]));

    // Build shared category breakdown by category_id
    const sharedExpensesByCatId = new Map<number | string, { total: number; count: number; name: string }>();
    for (const exp of sharedExpenses) {
      const key = exp.category_id ?? exp.category;
      const existing = sharedExpensesByCatId.get(key);
      if (existing) {
        existing.total += exp.amount;
        existing.count += 1;
      } else {
        const catInfo = typeof key === 'number' ? sharedCategoryMap.get(key) : null;
        sharedExpensesByCatId.set(key, {
          total: exp.amount,
          count: 1,
          name: catInfo?.name ?? exp.category,
        });
      }
    }

    // Merge: ensure every shared category appears (even with 0 spent)
    const categoryBreakdown: Array<{ category: string; total: number; budget: number; count: number }> = [];
    const seenCatIds = new Set<number | string>();

    for (const cat of sharedCategories) {
      const expData = sharedExpensesByCatId.get(cat.id);
      categoryBreakdown.push({
        category: cat.name,
        total: expData?.total ?? 0,
        budget: cat.budget_amount,
        count: expData?.count ?? 0,
      });
      seenCatIds.add(cat.id);
    }
    // Add expenses whose category_id didn't match any known category
    for (const [key, data] of sharedExpensesByCatId) {
      if (!seenCatIds.has(key)) {
        categoryBreakdown.push({
          category: data.name,
          total: data.total,
          budget: 0,
          count: data.count,
        });
      }
    }

    // Personal category breakdown
    const userPersonalExpenses = expenses.filter(exp => exp.type === 'personal' && isExpenseOwner(exp, req.user!));
    const personalExpensesByCatId = new Map<number | string, { total: number; count: number; name: string }>();
    for (const exp of userPersonalExpenses) {
      const key = exp.category_id ?? exp.category;
      const existing = personalExpensesByCatId.get(key);
      if (existing) {
        existing.total += exp.amount;
        existing.count += 1;
      } else {
        const catInfo = typeof key === 'number' ? personalCategoryMap.get(key) : null;
        personalExpensesByCatId.set(key, {
          total: exp.amount,
          count: 1,
          name: catInfo?.name ?? exp.category,
        });
      }
    }

    const personalCategoryBreakdown: Array<{ category: string; total: number; budget: number; count: number }> = [];
    const seenPersonalCatIds = new Set<number | string>();
    for (const cat of personalCategories) {
      const expData = personalExpensesByCatId.get(cat.id);
      personalCategoryBreakdown.push({
        category: cat.name,
        total: expData?.total ?? 0,
        budget: cat.budget_amount,
        count: expData?.count ?? 0,
      });
      seenPersonalCatIds.add(cat.id);
    }
    for (const [key, data] of personalExpensesByCatId) {
      if (!seenPersonalCatIds.has(key)) {
        personalCategoryBreakdown.push({
          category: data.name,
          total: data.total,
          budget: 0,
          count: data.count,
        });
      }
    }

    // Recent transactions (last 5)
    const recentTransactions = expenses
      .sort((a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime())
      .slice(0, 5);

    // Personal spending visible to the current user
    const personalSpent = userPersonalExpenses.reduce((sum, exp) => sum + exp.amount, 0);

    res.json({
      budget: {
        total: 0,
        rent: 0,
        savings: 0,
        personal: personalBudget,
        availableShared,
      },
      spending: {
        totalSpent,
        totalSharedSpent,
        remainingShared: availableShared - totalSharedSpent,
      },
      personal: {
        owner: req.user!.username,
        spent: personalSpent,
        budget: personalBudget,
      },
      categoryBreakdown,
      personalCategoryBreakdown,
      recentTransactions,
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

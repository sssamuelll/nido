import { Router } from 'express';
import { getDatabase } from '../db.js';
import { AuthRequest } from '../auth.js';

const router = Router();

const CATEGORY_FALLBACK_COLORS: Record<string, string> = {
  Restaurant: '#ff8c6b',
  Gastos: '#7cb5e8',
  Servicios: '#c4a0e8',
  Ocio: '#e87ca0',
  'Inversión': '#a6c79c',
  Otros: '#a89e94',
};

interface MonthlyRow {
  month: string;
  total: number;
}

interface CategoryRow {
  name: string;
  amount: number;
}

interface CountRow {
  count: number;
}

interface TotalRow {
  total: number;
}

interface CategoryColorRow {
  name: string;
  color: string;
}

interface CategoryBudgetRow {
  category: string;
  amount: number;
}

interface BudgetRow {
  shared_available: number;
  personal_samuel: number;
  personal_maria: number;
}

const getPersonalBudgetForUser = (budget: BudgetRow, username: string): number =>
  username === 'maria' ? budget.personal_maria : budget.personal_samuel;

router.get('/', async (req: AuthRequest, res) => {
  try {
    const db = getDatabase();
    const months = parseInt(req.query.months as string) || 6;
    const context = (req.query.context as string) === 'personal' ? 'personal' : 'shared';
    const username = req.user!.username;
    const userId = req.user!.id;

    // Build date range
    const now = new Date();
    const currentMonth = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`;

    let dateFilter = '';
    let dateParams: string[] = [];
    if (months > 0) {
      const startDate = new Date(now.getFullYear(), now.getMonth() - months + 1, 1);
      const startMonth = `${startDate.getFullYear()}-${String(startDate.getMonth() + 1).padStart(2, '0')}`;
      dateFilter = 'AND date >= ?';
      dateParams = [`${startMonth}-01`];
    }

    // Context filter
    const contextFilter = context === 'shared'
      ? "type = 'shared'"
      : `type = 'personal' AND paid_by = ?`;
    const contextParams = context === 'personal' ? [username] : [];

    // 1. Monthly totals
    const monthlyRows = await db.all<MonthlyRow[]>(`
      SELECT strftime('%Y-%m', date) as month, SUM(amount) as total
      FROM expenses
      WHERE ${contextFilter} ${dateFilter}
      GROUP BY month
      ORDER BY month
    `, ...contextParams, ...dateParams);

    const monthly = monthlyRows.map(row => ({
      month: row.month,
      total: row.total,
    }));

    // 2. Current month KPIs
    const currentMonthExpenses = await db.get<TotalRow>(`
      SELECT COALESCE(SUM(amount), 0) as total
      FROM expenses
      WHERE ${contextFilter} AND strftime('%Y-%m', date) = ?
    `, ...contextParams, currentMonth);

    const currentMonthCount = await db.get<CountRow>(`
      SELECT COUNT(*) as count
      FROM expenses
      WHERE ${contextFilter} AND strftime('%Y-%m', date) = ?
    `, ...contextParams, currentMonth);

    // Previous month
    const prevDate = new Date(now.getFullYear(), now.getMonth() - 1, 1);
    const prevMonth = `${prevDate.getFullYear()}-${String(prevDate.getMonth() + 1).padStart(2, '0')}`;

    const prevMonthExpenses = await db.get<TotalRow>(`
      SELECT COALESCE(SUM(amount), 0) as total
      FROM expenses
      WHERE ${contextFilter} AND strftime('%Y-%m', date) = ?
    `, ...contextParams, prevMonth);

    const totalSpent = currentMonthExpenses?.total ?? 0;
    const totalExpenses = currentMonthCount?.count ?? 0;
    const prevTotal = prevMonthExpenses?.total ?? 0;
    const vsPrevPeriod = prevTotal > 0 ? ((totalSpent - prevTotal) / prevTotal) * 100 : 0;
    const avgTicket = totalExpenses > 0 ? totalSpent / totalExpenses : 0;

    // 3. Net savings from budget
    const budget = await db.get<BudgetRow>('SELECT * FROM budgets WHERE month = ?', currentMonth);
    let netSavings = 0;
    if (budget) {
      if (context === 'shared') {
        netSavings = budget.shared_available - totalSpent;
      } else {
        netSavings = getPersonalBudgetForUser(budget, username) - totalSpent;
      }
    }

    const kpis = {
      totalSpent,
      netSavings,
      avgTicket: Math.round(avgTicket * 100) / 100,
      totalExpenses,
      vsPrevPeriod: Math.round(vsPrevPeriod * 100) / 100,
    };

    // 4. Category breakdown (current month)
    const categoryRows = await db.all<CategoryRow[]>(`
      SELECT category as name, SUM(amount) as amount
      FROM expenses
      WHERE ${contextFilter} AND strftime('%Y-%m', date) = ?
      GROUP BY category
      ORDER BY amount DESC
    `, ...contextParams, currentMonth);

    // Get category colors from categories table
    const householdUser = await db.get<{ household_id: number }>(
      'SELECT household_id FROM app_users WHERE id = ?',
      userId
    );
    const categoryColors = householdUser
      ? await db.all<CategoryColorRow[]>(
          'SELECT name, color FROM categories WHERE household_id = ?',
          householdUser.household_id
        )
      : [];
    const colorMap: Record<string, string> = {};
    for (const cc of categoryColors) {
      colorMap[cc.name] = cc.color;
    }

    const categoryTotal = categoryRows.reduce((sum, r) => sum + r.amount, 0);
    const categories = categoryRows.map(row => ({
      name: row.name,
      amount: row.amount,
      pct: categoryTotal > 0 ? Math.round((row.amount / categoryTotal) * 100) : 0,
      color: colorMap[row.name] || CATEGORY_FALLBACK_COLORS[row.name] || '#888888',
    }));

    // 5. Generate insights
    const insights: Array<{ type: 'positive' | 'warning' | 'tip'; message: string }> = [];

    // Insight: Positive trend (current < previous)
    if (prevTotal > 0 && totalSpent < prevTotal) {
      const pctDrop = Math.round(((prevTotal - totalSpent) / prevTotal) * 100);
      const topCategory = categoryRows.length > 0 ? categoryRows[0].name : null;
      const suffix = topCategory ? ` Recorte principal: ${topCategory}.` : '';
      insights.push({
        type: 'positive',
        message: `Gastaron ${pctDrop}% menos.${suffix}`,
      });
    }

    // Insight: Budget alert (category > 80% of its budget)
    const categoryBudgets = await db.all<CategoryBudgetRow[]>(
      'SELECT category, amount FROM category_budgets WHERE month = ?',
      currentMonth
    );
    for (const cb of categoryBudgets) {
      const catSpent = categoryRows.find(r => r.name === cb.category);
      if (catSpent && cb.amount > 0) {
        const pctUsed = (catSpent.amount / cb.amount) * 100;
        if (pctUsed >= 80) {
          insights.push({
            type: 'warning',
            message: `${cb.category} está al ${Math.round(pctUsed)}% del presupuesto.`,
          });
        }
      }
    }

    // Insight: Projection (extrapolate current spending to month end)
    const dayOfMonth = now.getDate();
    const daysInMonth = new Date(now.getFullYear(), now.getMonth() + 1, 0).getDate();
    if (dayOfMonth > 0 && budget) {
      const projectedSpend = (totalSpent / dayOfMonth) * daysInMonth;
      const budgetAmount = context === 'shared'
        ? budget.shared_available
        : getPersonalBudgetForUser(budget, username);
      const projectedSavings = budgetAmount - projectedSpend;
      if (projectedSavings > 0) {
        insights.push({
          type: 'tip',
          message: `Si mantienen este ritmo, cerrarán con €${Math.round(projectedSavings)} de ahorro.`,
        });
      }
    }

    // Insight: Anomaly (category > 30% above historical average)
    if (months > 0) {
      for (const cat of categoryRows) {
        const historicalAvg = await db.get<TotalRow>(`
          SELECT COALESCE(AVG(monthly_total), 0) as total
          FROM (
            SELECT SUM(amount) as monthly_total
            FROM expenses
            WHERE ${contextFilter} AND category = ? AND strftime('%Y-%m', date) != ?
            ${dateFilter}
            GROUP BY strftime('%Y-%m', date)
          )
        `, ...contextParams, cat.name, currentMonth, ...dateParams);

        if (historicalAvg && historicalAvg.total > 0) {
          const pctAbove = ((cat.amount - historicalAvg.total) / historicalAvg.total) * 100;
          if (pctAbove > 30) {
            insights.push({
              type: 'warning',
              message: `${cat.name} subió un ${Math.round(pctAbove)}% respecto a vuestra media.`,
            });
          }
        }
      }
    }

    // Insight: Savings streak (3+ consecutive months with savings)
    if (budget) {
      // Look back 6 months for consecutive savings
      const streakMonths: string[] = [];
      for (let i = 0; i < 6; i++) {
        const d = new Date(now.getFullYear(), now.getMonth() - i, 1);
        streakMonths.push(`${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`);
      }

      let streak = 0;
      for (const m of streakMonths) {
        const mBudget = await db.get<BudgetRow>('SELECT * FROM budgets WHERE month = ?', m);
        if (!mBudget) break;

        const mSpent = await db.get<TotalRow>(`
          SELECT COALESCE(SUM(amount), 0) as total
          FROM expenses
          WHERE ${contextFilter} AND strftime('%Y-%m', date) = ?
        `, ...contextParams, m);

        const budgetAmount = context === 'shared'
          ? mBudget.shared_available
          : getPersonalBudgetForUser(mBudget, username);

        if ((mSpent?.total ?? 0) < budgetAmount) {
          streak++;
        } else {
          break;
        }
      }

      if (streak >= 3) {
        insights.push({
          type: 'positive',
          message: `Llevan ${streak} meses ahorrando. ¿Quieren crear un objetivo?`,
        });
      }
    }

    res.json({
      monthly,
      kpis,
      categories,
      insights,
    });
  } catch (error) {
    console.error('Error fetching analytics:', error);
    res.status(500).json({ error: 'Failed to fetch analytics' });
  }
});

export default router;

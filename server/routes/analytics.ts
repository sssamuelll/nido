import { Router } from 'express';
import { getDatabase } from '../db.js';
import { AuthRequest } from '../auth.js';
import { getLegacyPaidBy as getLegacyPersonKey, getPersonalBudget } from '../user-utils.js';

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
  name: string;
  budget_amount: number;
}

interface HouseholdBudgetRow {
  total_amount: number;
  personal_samuel: number;
  personal_maria: number;
}

router.get('/', async (req: AuthRequest, res) => {
  try {
    const db = getDatabase();
    const months = parseInt(req.query.months as string) || 6;
    const context = (req.query.context as string) === 'personal' ? 'personal' : 'shared';
    const currentUser = req.user!;
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
    // DEPRECATED: paid_by filter — ideally use paid_by_user_id once CHECK constraint is removed
    const contextFilter = context === 'shared'
      ? "type = 'shared'"
      : `type = 'personal' AND paid_by = ?`;
    const contextParams = context === 'personal' ? [getLegacyPersonKey(currentUser)] : [];

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

    // Daily cumulative totals for chart
    const dailyRows = await db.all<{ date: string; total: number }[]>(`
      SELECT date, SUM(amount) as total
      FROM expenses
      WHERE ${contextFilter} ${dateFilter}
      GROUP BY date
      ORDER BY date
    `, ...contextParams, ...dateParams);

    // Build cumulative running total
    let cumulative = 0;
    const daily = dailyRows.map(row => {
      cumulative += row.total;
      return { date: row.date, total: cumulative };
    });

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

    // 3. Net savings from household budget
    const householdUser = await db.get<{ household_id: number }>(
      'SELECT household_id FROM app_users WHERE id = ?',
      userId
    );
    const householdId = householdUser?.household_id;

    const budget = await db.get<HouseholdBudgetRow>(
      'SELECT total_amount, personal_samuel, personal_maria FROM household_budget WHERE household_id = ?',
      householdId
    );
    let netSavings = 0;
    if (budget) {
      if (context === 'shared') {
        netSavings = budget.total_amount - totalSpent;
      } else {
        netSavings = getPersonalBudget(budget, currentUser) - totalSpent;
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

    // Get category colors and budget_amount from categories table
    const categoryMeta = householdId
      ? await db.all<(CategoryColorRow & { budget_amount: number })[]>(
          'SELECT name, emoji, color, COALESCE(budget_amount, 0) as budget_amount FROM categories WHERE household_id = ?',
          householdId
        )
      : [];
    const colorMap: Record<string, string> = {};
    const budgetMap: Record<string, number> = {};
    const emojiMap: Record<string, string> = {};
    for (const cc of categoryMeta) {
      colorMap[cc.name] = cc.color;
      budgetMap[cc.name] = cc.budget_amount;
      if ((cc as any).emoji) emojiMap[cc.name] = (cc as any).emoji;
    }

    const categoryTotal = categoryRows.reduce((sum, r) => sum + r.amount, 0);
    const categories = categoryRows.map(row => ({
      name: row.name,
      amount: row.amount,
      pct: categoryTotal > 0 ? Math.round((row.amount / categoryTotal) * 100) : 0,
      color: colorMap[row.name] || CATEGORY_FALLBACK_COLORS[row.name] || '#888888',
      emoji: emojiMap[row.name] || '📦',
      budget: budgetMap[row.name] || 0,
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

    // Insight: Budget alert (category > 80% of its budget) — from categories.budget_amount
    const categoryBudgets = householdId
      ? await db.all<CategoryBudgetRow[]>(
          `SELECT name, budget_amount FROM categories
           WHERE household_id = ? AND context = 'shared' AND owner_user_id IS NULL AND budget_amount > 0`,
          householdId
        )
      : [];
    for (const cb of categoryBudgets) {
      const catSpent = categoryRows.find(r => r.name === cb.name);
      if (catSpent && cb.budget_amount > 0) {
        const pctUsed = (catSpent.amount / cb.budget_amount) * 100;
        if (pctUsed >= 80) {
          insights.push({
            type: 'warning',
            message: `${cb.name} está al ${Math.round(pctUsed)}% del presupuesto.`,
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
        ? budget.total_amount
        : getPersonalBudget(budget, currentUser);
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
      const streakMonths: string[] = [];
      for (let i = 0; i < 6; i++) {
        const d = new Date(now.getFullYear(), now.getMonth() - i, 1);
        streakMonths.push(`${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`);
      }

      let streak = 0;
      for (const m of streakMonths) {
        const mSpent = await db.get<TotalRow>(`
          SELECT COALESCE(SUM(amount), 0) as total
          FROM expenses
          WHERE ${contextFilter} AND strftime('%Y-%m', date) = ?
        `, ...contextParams, m);

        // Use current household budget for comparison (no per-month budgets anymore)
        const budgetAmount = context === 'shared'
          ? budget.total_amount
          : getPersonalBudget(budget, currentUser);

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

    // 6. Household budget summary
    const totalBudgetAmount = budget
      ? (context === 'shared' ? budget.total_amount : getPersonalBudget(budget, currentUser))
      : 0;
    const allocated = categories.reduce((sum, c) => sum + c.budget, 0);
    const householdBudget = {
      total_amount: totalBudgetAmount,
      allocated,
      unallocated: Math.max(0, totalBudgetAmount - allocated),
    };

    res.json({
      monthly,
      daily,
      kpis,
      categories,
      insights,
      householdBudget,
    });
  } catch (error) {
    console.error('Error fetching analytics:', error);
    res.status(500).json({ error: 'Error al obtener analíticas' });
  }
});

export default router;

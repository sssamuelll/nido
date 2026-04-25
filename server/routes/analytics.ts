import { Router } from 'express';
import { getDatabase } from '../db.js';
import { AuthRequest } from '../auth.js';
import { getLegacyPaidBy as getLegacyPersonKey, getPersonalBudget } from '../user-utils.js';
import {
  AnalyticsQuery,
  analyticsQuerySchema,
  validateQuery,
} from '../validation.js';

const router = Router();

const CATEGORY_FALLBACK_COLORS: Record<string, string> = {
  Restaurant: '#ff8c6b',
  Gastos: '#7cb5e8',
  Servicios: '#c4a0e8',
  Ocio: '#e87ca0',
  'Inversión': '#a6c79c',
  Otros: '#a89e94',
};

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

router.get('/', validateQuery(analyticsQuerySchema), async (req: AuthRequest, res) => {
  try {
    const db = getDatabase();
    const { context, start_date: startDate, end_date: endDate } =
      (req as AuthRequest & { validatedQuery: AnalyticsQuery }).validatedQuery;
    const currentUser = req.user!;
    const userId = req.user!.id;

    let dateFilter = '';
    let dateParams: string[] = [];
    if (startDate) {
      dateFilter = endDate
        ? 'AND date >= ? AND date < ?'
        : 'AND date >= ?';
      dateParams = endDate ? [startDate, endDate] : [startDate];
    }

    // Context filter
    const contextFilter = context === 'shared'
      ? "type = 'shared'"
      : `type = 'personal' AND paid_by = ?`;
    const contextParams = context === 'personal' ? [getLegacyPersonKey(currentUser)] : [];

    // 1. Daily cumulative totals for chart
    const dailyRows = await db.all<{ date: string; total: number }[]>(`
      SELECT date, SUM(amount) as total
      FROM expenses
      WHERE ${contextFilter} ${dateFilter}
      GROUP BY date
      ORDER BY date
    `, ...contextParams, ...dateParams);

    let cumulative = 0;
    const daily = dailyRows.map(row => {
      cumulative += row.total;
      return { date: row.date, total: cumulative };
    });

    // 2. KPIs for the selected period
    const periodExpenses = await db.get<TotalRow>(`
      SELECT COALESCE(SUM(amount), 0) as total
      FROM expenses
      WHERE ${contextFilter} ${dateFilter}
    `, ...contextParams, ...dateParams);

    const periodCount = await db.get<CountRow>(`
      SELECT COUNT(*) as count
      FROM expenses
      WHERE ${contextFilter} ${dateFilter}
    `, ...contextParams, ...dateParams);

    const totalSpent = periodExpenses?.total ?? 0;
    const totalExpenses = periodCount?.count ?? 0;
    const avgTicket = totalExpenses > 0 ? totalSpent / totalExpenses : 0;

    // Compare against previous period of equal length
    let vsPrevPeriod = 0;
    if (startDate) {
      const periodStart = new Date(startDate);
      const periodEnd = endDate ? new Date(endDate) : new Date();
      const periodDays = Math.max(1, Math.round((periodEnd.getTime() - periodStart.getTime()) / 86400000));
      const prevStart = new Date(periodStart.getTime() - periodDays * 86400000);
      const prevEnd = periodStart;

      const prevTotal = await db.get<TotalRow>(`
        SELECT COALESCE(SUM(amount), 0) as total FROM expenses
        WHERE ${contextFilter} AND date >= ? AND date < ?
      `, ...contextParams, prevStart.toISOString().slice(0, 10), prevEnd.toISOString().slice(0, 10));

      if (prevTotal && prevTotal.total > 0) {
        vsPrevPeriod = ((totalSpent - prevTotal.total) / prevTotal.total) * 100;
      }
    }

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

    // 4. Category breakdown (matches selected period)
    const categoryRows = await db.all<CategoryRow[]>(`
      SELECT category as name, SUM(amount) as amount
      FROM expenses
      WHERE ${contextFilter} ${dateFilter}
      GROUP BY category
      ORDER BY amount DESC
    `, ...contextParams, ...dateParams);

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

    // Insight: Positive trend (current period < previous period)
    if (startDate && vsPrevPeriod < 0) {
      const pctDrop = Math.abs(Math.round(vsPrevPeriod));
      const topCategory = categoryRows.length > 0 ? categoryRows[0].name : null;
      const suffix = topCategory ? ` Recorte principal: ${topCategory}.` : '';
      insights.push({
        type: 'positive',
        message: `Gastaron ${pctDrop}% menos que el ciclo anterior.${suffix}`,
      });
    }

    // Insight: Budget alert (category > 80% of its budget)
    const budgetContextFilter = context === 'shared'
      ? `context = 'shared' AND owner_user_id IS NULL`
      : `context = 'personal' AND owner_user_id = ${userId}`;
    const categoryBudgets = householdId
      ? await db.all<CategoryBudgetRow[]>(
          `SELECT name, budget_amount FROM categories
           WHERE household_id = ? AND ${budgetContextFilter} AND budget_amount > 0`,
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

    // Insight: Spending rate comparison (daily spend vs overall average)
    if (startDate) {
      const periodStart = new Date(startDate);
      const periodEnd = endDate ? new Date(endDate) : new Date();
      const periodDays = Math.max(1, Math.round((periodEnd.getTime() - periodStart.getTime()) / 86400000));
      const dailyRate = totalSpent / periodDays;

      const overallAvg = await db.get<TotalRow & CountRow>(`
        SELECT COALESCE(SUM(amount), 0) as total,
               COUNT(DISTINCT date) as count
        FROM expenses
        WHERE ${contextFilter}
      `, ...contextParams);

      if (overallAvg && overallAvg.count > 0) {
        const overallDailyRate = overallAvg.total / overallAvg.count;
        if (overallDailyRate > 0 && dailyRate < overallDailyRate * 0.8) {
          insights.push({
            type: 'tip',
            message: `Ritmo de gasto diario (€${Math.round(dailyRate)}) por debajo de la media histórica (€${Math.round(overallDailyRate)}).`,
          });
        }
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

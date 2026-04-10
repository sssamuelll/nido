export interface DashboardSummaryData {
  budget?: {
    personal?: number;
    availableShared?: number;
  };
  spending?: {
    totalSharedSpent?: number;
    remainingShared?: number;
  };
  personal?: {
    owner?: string;
    spent?: number;
    budget?: number;
  };
}

export interface PersonalBalanceCardViewModel {
  owner: string;
  name: string;
  avatar: string;
  balance: number;
  monthChange: number;
  progress: number;
  sparkline: number[];
}

export interface VisibleBudgetFormData {
  month: string;
  shared_available: number;
  personal_budget: number;
  categories: Record<string, number>;
}

export interface VisibleExpense {
  id: number;
  description: string;
  amount: number;
  category: string;
  date: string;
  paid_by: string;
  paid_by_user_id?: number | null;
  type: string;
  created_at?: string;
}

export interface PersonalCategorySnapshot {
  category: string;
  total: number;
  count: number;
  budgetShare: number;
  monthShare: number;
}

export interface PersonalAnalyticsPoint {
  label: string;
  total: number;
}

export interface PersonalDetailViewModel {
  owner: string;
  name: string;
  personalBudget: number;
  personalSpent: number;
  remaining: number;
  progress: number;
  averageExpense: number;
  topCategory: string;
  categories: PersonalCategorySnapshot[];
  recentExpenses: VisibleExpense[];
  chart: PersonalAnalyticsPoint[];
}

const toNum = (value: unknown, fallback = 0) =>
  Number.isFinite(Number(value)) ? Number(value) : fallback;

export const getPersonalBalanceCardModel = (data: DashboardSummaryData): PersonalBalanceCardViewModel => {
  const owner = data?.personal?.owner || 'samuel';
  const spent = toNum(data?.personal?.spent);
  const budget = toNum(data?.personal?.budget ?? data?.budget?.personal);
  const balance = budget - spent;
  const progress = budget > 0 ? Math.round((spent / budget) * 100) : 0;
  const displayName = owner
    ? owner.charAt(0).toUpperCase() + owner.slice(1)
    : 'Usuario';

  return {
    owner,
    name: displayName,
    avatar: owner.charAt(0).toUpperCase(),
    balance,
    monthChange: -spent,
    progress,
    sparkline: [budget * 0.3, budget * 0.5, budget * 0.4, budget * 0.6, budget * 0.7, spent],
  };
};

export const toVisibleBudgetFormData = (
  data: { shared_available?: number; personal_budget?: number; categories?: Record<string, number> } | null | undefined,
  month: string,
  fallbackPersonalBudget = 500
): VisibleBudgetFormData => ({
  month,
  shared_available: Number(data?.shared_available ?? 2000),
  personal_budget: Number(data?.personal_budget ?? fallbackPersonalBudget),
  categories: data?.categories && typeof data.categories === 'object' ? data.categories : {},
});

const compareByNewest = (a: VisibleExpense, b: VisibleExpense) =>
  new Date(b.created_at ?? `${b.date}T12:00:00`).getTime() - new Date(a.created_at ?? `${a.date}T12:00:00`).getTime();

const getRecentExpenseWindow = (expenses: VisibleExpense[], maxItems = 5, maxDays = 3) => {
  const sorted = [...expenses].sort(compareByNewest);
  if (sorted.length === 0) return [];

  const newestTs = new Date(sorted[0].created_at ?? `${sorted[0].date}T12:00:00`).getTime();
  const maxAgeMs = maxDays * 24 * 60 * 60 * 1000;

  return sorted
    .filter((expense) => newestTs - new Date(expense.created_at ?? `${expense.date}T12:00:00`).getTime() <= maxAgeMs)
    .slice(0, maxItems);
};

const buildWeeklyChart = (expenses: VisibleExpense[]): PersonalAnalyticsPoint[] => {
  const buckets = [
    { label: 'Sem 1', total: 0 },
    { label: 'Sem 2', total: 0 },
    { label: 'Sem 3', total: 0 },
    { label: 'Sem 4', total: 0 },
    { label: 'Sem 5', total: 0 },
  ];

  expenses.forEach((expense) => {
    const date = new Date(`${expense.date}T12:00:00`);
    const bucketIndex = Math.min(4, Math.floor((date.getDate() - 1) / 7));
    buckets[bucketIndex].total += toNum(expense.amount);
  });

  return buckets;
};

const getLegacyPersonKey = (username: string) => {
  const normalized = (username || '').toLowerCase().trim();
  return normalized.includes('maria') || normalized.includes('mara') ? 'maria' : 'samuel';
};

export const getPrivateExpensesForUser = (
  expenses: VisibleExpense[],
  username: string,
  userId?: number
): VisibleExpense[] => {
  const legacyKey = getLegacyPersonKey(username);
  return (Array.isArray(expenses) ? expenses : [])
    .filter((expense) => {
      if (expense?.type !== 'personal') return false;
      if (userId && expense?.paid_by_user_id != null) {
        return expense.paid_by_user_id === userId;
      }
      return expense?.paid_by === legacyKey;
    })
    .sort(compareByNewest);
};

export const buildPersonalDetailModel = ({
  summary,
  budget,
  expenses,
  username,
  userId,
}: {
  summary?: DashboardSummaryData | null;
  budget?: VisibleBudgetFormData | null;
  expenses?: VisibleExpense[] | null;
  username: string;
  userId?: number;
}): PersonalDetailViewModel => {
  const owner = summary?.personal?.owner || username || 'samuel';
  const personalBudget = toNum(summary?.personal?.budget ?? budget?.personal_budget ?? summary?.budget?.personal);
  const privateExpenses = getPrivateExpensesForUser(expenses ?? [], username, userId);
  const personalSpent = privateExpenses.reduce((sum, expense) => sum + toNum(expense.amount), 0);
  const remaining = personalBudget - personalSpent;
  const progress = personalBudget > 0 ? Math.min(100, Math.round((personalSpent / personalBudget) * 100)) : 0;

  const categoryTotals = privateExpenses.reduce<Record<string, PersonalCategorySnapshot>>((acc, expense) => {
    const category = expense.category || 'Otros';
    if (!acc[category]) {
      acc[category] = {
        category,
        total: 0,
        count: 0,
        budgetShare: 0,
        monthShare: 0,
      };
    }

    acc[category].total += toNum(expense.amount);
    acc[category].count += 1;
    return acc;
  }, {});

  const categories = Object.values(categoryTotals)
    .map((entry) => ({
      ...entry,
      budgetShare: personalBudget > 0 ? Math.min(100, Math.round((entry.total / personalBudget) * 100)) : 0,
      monthShare: personalSpent > 0 ? Math.round((entry.total / personalSpent) * 100) : 0,
    }))
    .sort((a, b) => b.total - a.total);

  return {
    owner,
    name: owner ? owner.charAt(0).toUpperCase() + owner.slice(1) : 'Usuario',
    personalBudget,
    personalSpent,
    remaining,
    progress,
    averageExpense: privateExpenses.length > 0 ? personalSpent / privateExpenses.length : 0,
    topCategory: categories[0]?.category ?? 'Sin gastos',
    categories,
    recentExpenses: getRecentExpenseWindow(privateExpenses, 5, 3),
    chart: buildWeeklyChart(privateExpenses),
  };
};

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
    owner?: 'samuel' | 'maria';
    spent?: number;
    budget?: number;
  };
}

export interface PersonalBalanceCardViewModel {
  owner: 'samuel' | 'maria';
  name: string;
  avatar: string;
  balance: number;
  monthChange: number;
  progress: number;
  sparkline: number[];
}

export interface VisibleBudgetFormData {
  month: string;
  total_budget: number;
  rent: number;
  savings: number;
  personal_budget: number;
  categories: Record<string, number>;
}

const toNum = (value: unknown, fallback = 0) =>
  Number.isFinite(Number(value)) ? Number(value) : fallback;

export const getPersonalBalanceCardModel = (data: DashboardSummaryData): PersonalBalanceCardViewModel => {
  const owner = data?.personal?.owner === 'maria' ? 'maria' : 'samuel';
  const spent = toNum(data?.personal?.spent);
  const budget = toNum(data?.personal?.budget ?? data?.budget?.personal);
  const balance = budget - spent;
  const progress = budget > 0 ? Math.round((spent / budget) * 100) : 0;

  return {
    owner,
    name: owner === 'maria' ? 'María' : 'Samuel',
    avatar: owner === 'maria' ? '👩🎨' : '👨💻',
    balance,
    monthChange: -spent,
    progress,
    sparkline: [budget * 0.3, budget * 0.5, budget * 0.4, budget * 0.6, budget * 0.7, spent],
  };
};

export const toVisibleBudgetFormData = (
  data: any,
  month: string,
  fallbackPersonalBudget = 500
): VisibleBudgetFormData => ({
  month,
  total_budget: Number(data?.total_budget ?? 2800),
  rent: Number(data?.rent ?? 335),
  savings: Number(data?.savings ?? 300),
  personal_budget: Number(data?.personal_budget ?? fallbackPersonalBudget),
  categories: data?.categories && typeof data.categories === 'object' ? data.categories : {},
});

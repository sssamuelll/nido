export type Owner = string;

export interface User {
  id: number;
  name: string;
  avatar: string;
  owner: Owner;
}

export interface OwnerTheme {
  base: string;
  light: string;
  deep: string;
  gradient: string;
  gradientDiag: string;
  glow: string;
  dot: string;
}

export interface Transaction {
  id: number;
  name: string;
  payer: string;
  amount: number;
  date: string;
  category: string;
  emoji: string;
}

export interface BudgetCategory {
  id: string;
  name: string;
  emoji: string;
  current: number;
  max: number;
  owner: Owner;
  gradientColors?: [string, string];
}

export interface Goal {
  id: number;
  name: string;
  icon: string;
  target: number;
  current: number;
  deadline: string | null;
  owner_type: 'shared' | 'personal';
  owner_user_id: number | null;
  created_at: string;
}

export interface BalanceData {
  owner: Owner;
  name: string;
  avatar: string;
  balance: number;
  monthChange: number;
  progress: number;
  sparkline: number[];
}

export interface AnalyticsData {
  periods: string[];
  chartData: Record<Owner, number[]>;
  months: string[];
  topCategories: Array<{
    emoji: string;
    name: string;
    amount: number;
    pct: number;
    color: string;
  }>;
  stats: Array<{
    label: string;
    value: string;
    delta: string;
    up: boolean;
  }>;
}

export const OWNER_THEMES: Record<Owner, OwnerTheme> = {
  samuel: {
    base: '#34D399',
    light: '#6EE7B7',
    deep: '#10B981',
    gradient: 'linear-gradient(135deg, #34D399, #2DD4BF)',
    gradientDiag: 'linear-gradient(225deg, #34D399, #10B981)',
    glow: 'rgba(52, 211, 153, 0.2)',
    dot: '#34D399',
  },
  maria: {
    base: '#A78BFA',
    light: '#C4B5FD',
    deep: '#8B5CF6',
    gradient: 'linear-gradient(135deg, #A78BFA, #8B5CF6)',
    gradientDiag: 'linear-gradient(225deg, #A78BFA, #8B5CF6)',
    glow: 'rgba(167, 139, 250, 0.2)',
    dot: '#A78BFA',
  },
  shared: {
    base: '#60A5FA',
    light: '#93C5FD',
    deep: '#3B82F6',
    gradient: 'linear-gradient(135deg, #60A5FA, #3B82F6)',
    gradientDiag: 'linear-gradient(225deg, #60A5FA, #3B82F6)',
    glow: 'rgba(96, 165, 250, 0.2)',
    dot: '#60A5FA',
  },
};


export const INDICATOR_COLORS: Record<string, string> = {
  samuel: '#34D399',
  maria: '#A78BFA',
  shared: '#60A5FA',
};

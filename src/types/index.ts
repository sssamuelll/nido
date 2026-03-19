export type Owner = 'samuel' | 'maria' | 'shared';

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
  id: string;
  name: string;
  emoji: string;
  current: number;
  target: number;
  deadline: string;
  owner: Owner;
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

export const CATEGORIES = [
  { id: 'Restaurant', name: 'Restaurant', emoji: '🍽️', color: '#F87171', iconBg: 'rgba(248,113,113,0.1)' },
  { id: 'Supermercado', name: 'Supermercado', emoji: '🛒', color: '#60A5FA', iconBg: 'rgba(96,165,250,0.1)' },
  { id: 'Servicios', name: 'Servicios', emoji: '💡', color: '#FBBF24', iconBg: 'rgba(251,191,36,0.1)' },
  { id: 'Ocio', name: 'Ocio', emoji: '🎉', color: '#A78BFA', iconBg: 'rgba(167,139,250,0.1)' },
  { id: 'Inversión', name: 'Inversión', emoji: '📈', color: '#34D399', iconBg: 'rgba(52,211,153,0.1)' },
  { id: 'Otros', name: 'Otros', emoji: '📦', color: '#6B7280', iconBg: 'rgba(107,114,128,0.1)' },
];

export const INDICATOR_COLORS: Record<string, string> = {
  samuel: '#34D399',
  maria: '#A78BFA',
  shared: '#60A5FA',
};

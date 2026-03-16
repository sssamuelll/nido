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
    base: '#8bdc6b',
    light: '#9de382',
    deep: '#6bc98b',
    gradient: 'linear-gradient(180deg, #8bdc6b, #6bc98b)',
    gradientDiag: 'linear-gradient(225deg, #8bdc6b, #6bc98b)',
    glow: 'rgba(139, 220, 107, 0.25)',
    dot: '#9de382',
  },
  maria: {
    base: '#ff8c6b',
    light: '#ffaa8c',
    deep: '#e87c7c',
    gradient: 'linear-gradient(180deg, #ff8c6b, #e87c7c)',
    gradientDiag: 'linear-gradient(225deg, #ff8c6b, #e87c7c)',
    glow: 'rgba(255, 140, 107, 0.25)',
    dot: '#ffaa8c',
  },
  shared: {
    base: '#7cb5e8',
    light: '#96c8f0',
    deep: '#5a9ecc',
    gradient: 'linear-gradient(180deg, #7cb5e8, #5a9ecc)',
    gradientDiag: 'linear-gradient(225deg, #7cb5e8, #5a9ecc)',
    glow: 'rgba(124, 181, 232, 0.25)',
    dot: '#96c8f0',
  },
};

export const CATEGORIES = [
  { id: 'Restaurant', name: 'Restaurant', emoji: '🍽️', color: '#ff8c6b' },
  { id: 'Gastos', name: 'Gastos', emoji: '🛒', color: '#7cb5e8' },
  { id: 'Servicios', name: 'Servicios', emoji: '💡', color: '#c4a0e8' },
  { id: 'Ocio', name: 'Ocio', emoji: '🎉', color: '#e87ca0' },
  { id: 'Inversión', name: 'Inversión', emoji: '📈', color: '#a6c79c' },
  { id: 'Otros', name: 'Otros', emoji: '🦋', color: '#a89e94' },
];

export const NEU_SHADOW = {
  xs: '2px 2px 5px #D4D7E3, -2px -2px 5px #FFFFFF',
  sm: '2px 2px 6px #D4D7E3, -2px -2px 6px #FFFFFF',
  md: '4px 4px 10px #D4D7E3, -4px -4px 10px #FFFFFF',
  lg: '6px 6px 14px #D4D7E3, -6px -6px 14px #FFFFFF',
};

export const INDICATOR_COLORS: Record<string, string> = {
  samuel: '#8bdc6b',
  maria: '#ff8c6b',
  shared: '#7cb5e8',
};

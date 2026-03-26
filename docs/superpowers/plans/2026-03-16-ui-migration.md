# Nido UI Migration Implementation Plan

> **For agentic workers:** REQUIRED: Use superpowers:subagent-driven-development (if subagents available) or superpowers:executing-plans to implement this plan. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Migrate Nido from dark glass-morphism to neumorphic light design while preserving all business logic and accent colors.

**Architecture:** Full UI rewrite (Big Bang). Replace `global.css` tokens, create new primitive components, rewrite all views to match reference design from `/Documents/nido-components`. Keep `api.ts` untouched, extract Login/Pin from `auth.tsx` into separate view files.

**Tech Stack:** React 18, TypeScript, Vite, CSS custom properties (no Tailwind), Lucide React icons, Fraunces/Outfit/JetBrains Mono fonts.

**Spec:** `docs/superpowers/specs/2026-03-16-ui-migration-design.md`

---

## Chunk 1: Foundation (Types, Tokens, HTML, Dependencies)

### Task 1: Install lucide-react

**Files:**
- Modify: `package.json`

- [ ] **Step 1: Install the dependency**

```bash
npm install lucide-react
```

- [ ] **Step 2: Verify installation**

```bash
node -e "require('lucide-react')" 2>/dev/null && echo "OK" || echo "FAIL"
```

Expected: OK (or check `node_modules/lucide-react` exists)

- [ ] **Step 3: Commit**

```bash
git add package.json package-lock.json
git commit -m "chore: add lucide-react icon library"
```

---

### Task 2: Create type definitions

**Files:**
- Create: `src/types/index.ts`

- [ ] **Step 1: Create the types file**

```typescript
// src/types/index.ts
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

// Indicator colors map payer names to owner colors
export const INDICATOR_COLORS: Record<string, string> = {
  samuel: '#8bdc6b',
  maria: '#ff8c6b',
  shared: '#7cb5e8',
};
```

- [ ] **Step 2: Verify TypeScript compiles**

```bash
npx tsc --noEmit src/types/index.ts 2>&1 | head -5
```

Expected: No errors (or only project-level config warnings)

- [ ] **Step 3: Commit**

```bash
git add src/types/index.ts
git commit -m "feat: add type definitions, owner themes, and constants"
```

---

### Task 3: Update index.html

**Files:**
- Modify: `index.html`

- [ ] **Step 1: Replace font imports and remove liquid glass filter**

Replace the entire `index.html` with:

```html
<!DOCTYPE html>
<html lang="es">
  <head>
    <meta charset="UTF-8" />
    <link rel="icon" type="image/svg+xml" href="/icons/icon-192x192.png" />
    <meta name="viewport" content="width=device-width, initial-scale=1.0" />
    <meta name="description" content="Control de gastos para parejas" />
    <meta name="theme-color" content="#F0F1F7" />
    <link rel="preconnect" href="https://fonts.googleapis.com">
    <link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
    <link href="https://fonts.googleapis.com/css2?family=Fraunces:ital,opsz,wght@0,9..144,400;0,9..144,600;0,9..144,700;1,9..144,400&family=Outfit:wght@300;400;500;600;700&family=JetBrains+Mono:wght@400;500;600&display=swap" rel="stylesheet">
    <title>Nido - Control de Gastos</title>
  </head>
  <body>
    <div id="root"></div>
    <script type="module" src="/src/main.tsx"></script>
  </body>
</html>
```

Changes from current:
- `theme-color` changed from `#eab308` to `#F0F1F7`
- Inter font replaced with Fraunces + Outfit + JetBrains Mono
- Liquid glass SVG filter block removed entirely

- [ ] **Step 2: Verify dev server starts**

```bash
npm run client:dev -- --host 2>&1 | head -5
```

Expected: Vite dev server starts without errors

- [ ] **Step 3: Commit**

```bash
git add index.html
git commit -m "feat: update fonts and theme-color for neumorphic design"
```

---

### Task 4: Rewrite global.css with new design tokens

**Files:**
- Modify: `src/styles/global.css` (full rewrite)

- [ ] **Step 1: Replace global.css**

Replace the entire file. This is the largest single file in the migration (~800 lines replacing ~2900 lines). The file contains:

1. CSS reset and base styles
2. All design token variables (`:root`)
3. Typography utility classes
4. Layout classes (app-layout, sidebar, bottom-nav, content-area)
5. All component classes (`.btn`, `.input-field`, `.balance-card`, `.budget-capsule`, `.transaction-row`, `.category-pill`, `.numpad-key`, `.goal-card`, `.nav-item`, etc.)
6. Page-specific classes (`.dashboard`, `.add-expense`, `.history`, `.settings`, `.analytics`, `.goals`, `.login`)
7. Skeleton loading animation
8. Responsive breakpoints

The complete CSS is too long for inline plan code. The implementer should:

a) Start with `:root` variables — copy all tokens from spec Section 1 (colors, typography, spacing, radius, shadows, transitions)

b) Write base reset:
```css
*, *::before, *::after { box-sizing: border-box; margin: 0; padding: 0; }
html { font-family: var(--font-body); color: var(--color-text-primary); background: var(--color-bg); }
body { min-height: 100vh; -webkit-font-smoothing: antialiased; }
```

c) Write layout classes:
```css
.app-layout {
  display: flex;
  height: 100vh;
  background: var(--color-bg);
}
.content-area {
  flex: 1;
  overflow: auto;
  display: flex;
  flex-direction: column;
  gap: 28px;
  padding: 32px 36px;
}
@media (max-width: 1023px) {
  .content-area { padding: 20px 16px; padding-bottom: 6rem; }
}
```

d) Write component classes following the spec Section 4 table. Each component gets:
- Base class with neumorphic styling (`background: var(--color-surface); box-shadow: var(--shadow-neu); border-radius: var(--radius-xl)`)
- Variant classes (`.btn--samuel`, `.balance-card--samuel`, etc.)
- State classes (`.btn:active`, `.input-field--focused`, `.category-pill--active`)
- Child element classes (`.balance-card__name`, `.balance-card__amount`, etc.)

e) Write page layout classes for each view (`.login`, `.pin-page`, `.dashboard`, `.add-expense`, `.history`, `.settings`, `.analytics`, `.goals`, `.loading-screen`)

f) Write responsive breakpoints for mobile (<1024px) — sidebar hidden, bottom-nav visible, content padding adjusted

g) Write skeleton/loading animation:
```css
@keyframes skeleton-pulse {
  0%, 100% { opacity: 0.6; }
  50% { opacity: 0.3; }
}
.skeleton { animation: skeleton-pulse 1.5s ease-in-out infinite; background: var(--color-surface); border-radius: var(--radius-md); }
```

**Reference:** The reference design at `/Documents/nido-components/src/styles/tokens.css` has the token values. The inline styles in each reference component (e.g., `/Documents/nido-components/src/components/Button.tsx`) have the exact pixel values, paddings, font sizes, etc. to translate into CSS classes.

- [ ] **Step 2: Verify CSS loads without errors**

```bash
npm run client:dev 2>&1 | grep -i error | head -5
```

Expected: No CSS-related errors

- [ ] **Step 3: Commit**

```bash
git add src/styles/global.css
git commit -m "feat: rewrite global.css with neumorphic design tokens and component classes"
```

---

## Chunk 2: Primitive Components

### Task 5: Create Button component

**Files:**
- Create: `src/components/Button.tsx`

- [ ] **Step 1: Create Button component**

```tsx
import React, { useState } from 'react';
import { OWNER_THEMES, type Owner } from '../types';

interface ButtonProps {
  label: string;
  variant?: Owner;
  onClick?: () => void;
  fullWidth?: boolean;
  type?: 'button' | 'submit';
  size?: 'sm' | 'md';
  disabled?: boolean;
  children?: React.ReactNode;
}

export const Button: React.FC<ButtonProps> = ({
  label,
  variant = 'samuel',
  onClick,
  fullWidth = false,
  type = 'button',
  size = 'md',
  disabled = false,
  children,
}) => {
  const theme = OWNER_THEMES[variant];

  return (
    <button
      type={type}
      className={`btn btn--${variant} ${size === 'sm' ? 'btn--sm' : ''} ${fullWidth ? 'btn--full' : ''}`}
      onClick={onClick}
      disabled={disabled}
      style={{
        '--btn-gradient': theme.gradient,
        '--btn-glow': theme.glow,
      } as React.CSSProperties}
    >
      {children || label}
    </button>
  );
};
```

- [ ] **Step 2: Commit**

```bash
git add src/components/Button.tsx
git commit -m "feat: add Button component with owner variants"
```

---

### Task 6: Create InputField component

**Files:**
- Create: `src/components/InputField.tsx`

- [ ] **Step 1: Create InputField component**

```tsx
import React, { useState } from 'react';

interface InputFieldProps {
  label?: string;
  placeholder?: string;
  value?: string;
  onChange?: (value: string) => void;
  type?: string;
  name?: string;
  disabled?: boolean;
  icon?: React.ReactNode;
}

export const InputField: React.FC<InputFieldProps> = ({
  label,
  placeholder,
  value,
  onChange,
  type = 'text',
  name,
  disabled = false,
  icon,
}) => {
  const [focused, setFocused] = useState(false);

  return (
    <div className="input-field">
      {label && <label className="input-field__label">{label}</label>}
      <div className={`input-field__box ${focused ? 'input-field--focused' : ''}`}>
        {icon && <span className="input-field__icon">{icon}</span>}
        <input
          type={type}
          name={name}
          className="input-field__input"
          placeholder={placeholder}
          value={value}
          onChange={(e) => onChange?.(e.target.value)}
          onFocus={() => setFocused(true)}
          onBlur={() => setFocused(false)}
          disabled={disabled}
        />
      </div>
    </div>
  );
};
```

- [ ] **Step 2: Commit**

```bash
git add src/components/InputField.tsx
git commit -m "feat: add InputField component with neumorphic styling"
```

---

### Task 7: Create NavItem component

**Files:**
- Create: `src/components/NavItem.tsx`

- [ ] **Step 1: Create NavItem component**

```tsx
import React, { useState } from 'react';
import * as LucideIcons from 'lucide-react';

interface NavItemProps {
  icon: string;
  label: string;
  active?: boolean;
  onClick?: () => void;
}

// Convert kebab-case icon name to PascalCase component name
const getIcon = (name: string): React.FC<{ size?: number; color?: string }> | null => {
  const pascal = name
    .split('-')
    .map((s) => s.charAt(0).toUpperCase() + s.slice(1))
    .join('');
  return (LucideIcons as any)[pascal] || null;
};

export const NavItem: React.FC<NavItemProps> = ({ icon, label, active = false, onClick }) => {
  const [hovered, setHovered] = useState(false);
  const IconComponent = getIcon(icon);

  return (
    <button
      className={`nav-item ${active ? 'nav-item--active' : ''}`}
      onClick={onClick}
      onMouseEnter={() => setHovered(true)}
      onMouseLeave={() => setHovered(false)}
    >
      {IconComponent && (
        <IconComponent
          size={22}
          color={active ? '#FFFFFF' : hovered ? 'rgba(255,255,255,0.8)' : 'rgba(255,255,255,0.6)'}
        />
      )}
      <span className="nav-item__label">{label}</span>
    </button>
  );
};
```

- [ ] **Step 2: Commit**

```bash
git add src/components/NavItem.tsx
git commit -m "feat: add NavItem component with Lucide icons"
```

---

### Task 8: Create CategoryPill component

**Files:**
- Create: `src/components/CategoryPill.tsx`

- [ ] **Step 1: Create CategoryPill component**

```tsx
import React from 'react';

interface CategoryPillProps {
  emoji: string;
  name: string;
  active?: boolean;
  onClick?: () => void;
}

export const CategoryPill: React.FC<CategoryPillProps> = ({
  emoji,
  name,
  active = false,
  onClick,
}) => {
  return (
    <button
      className={`category-pill ${active ? 'category-pill--active' : ''}`}
      onClick={onClick}
    >
      <span className="category-pill__emoji">{emoji}</span>
      <span className="category-pill__name">{name}</span>
    </button>
  );
};
```

- [ ] **Step 2: Commit**

```bash
git add src/components/CategoryPill.tsx
git commit -m "feat: add CategoryPill component"
```

---

### Task 9: Create NumpadKey component

**Files:**
- Create: `src/components/NumpadKey.tsx`

- [ ] **Step 1: Create NumpadKey component**

```tsx
import React, { useState } from 'react';
import { Delete } from 'lucide-react';

interface NumpadKeyProps {
  label: string;
  onClick?: () => void;
  variant?: 'default' | 'action' | 'delete';
}

export const NumpadKey: React.FC<NumpadKeyProps> = ({
  label,
  onClick,
  variant = 'default',
}) => {
  const [active, setActive] = useState(false);

  return (
    <button
      className={`numpad-key ${variant !== 'default' ? `numpad-key--${variant}` : ''} ${active ? 'numpad-key--pressed' : ''}`}
      onClick={onClick}
      onPointerDown={() => setActive(true)}
      onPointerUp={() => setActive(false)}
      onPointerLeave={() => setActive(false)}
    >
      {variant === 'delete' ? <Delete size={20} /> : label}
    </button>
  );
};
```

- [ ] **Step 2: Commit**

```bash
git add src/components/NumpadKey.tsx
git commit -m "feat: add NumpadKey component with neumorphic press states"
```

---

### Task 10: Create TransactionRow component

**Files:**
- Create: `src/components/TransactionRow.tsx`

- [ ] **Step 1: Create TransactionRow component**

```tsx
import React from 'react';

interface TransactionRowProps {
  emoji: string;
  name: string;
  payer: string;
  amount: string;
  date: string;
  indicatorColor?: string;
  isPositive?: boolean;
  onDelete?: () => void;
}

export const TransactionRow: React.FC<TransactionRowProps> = ({
  emoji,
  name,
  payer,
  amount,
  date,
  indicatorColor = '#8bdc6b',
  isPositive = false,
  onDelete,
}) => {
  return (
    <div
      className="transaction-row"
      style={{ '--indicator-color': indicatorColor } as React.CSSProperties}
    >
      <div className="transaction-row__indicator" />
      <span className="transaction-row__emoji">{emoji}</span>
      <div className="transaction-row__info">
        <span className="transaction-row__name">{name}</span>
        <span className="transaction-row__payer">{payer}</span>
      </div>
      <div className="transaction-row__right">
        <span className={`transaction-row__amount ${isPositive ? 'transaction-row__amount--positive' : ''}`}>
          {amount}
        </span>
        <span className="transaction-row__date">{date}</span>
      </div>
      {onDelete && (
        <button className="transaction-row__delete" onClick={(e) => { e.stopPropagation(); onDelete(); }}>
          ×
        </button>
      )}
    </div>
  );
};
```

- [ ] **Step 2: Commit**

```bash
git add src/components/TransactionRow.tsx
git commit -m "feat: add TransactionRow component with indicator bar"
```

---

### Task 11: Create BudgetCapsule component

**Files:**
- Create: `src/components/BudgetCapsule.tsx`

- [ ] **Step 1: Create BudgetCapsule component**

```tsx
import React from 'react';

interface BudgetCapsuleProps {
  emoji: string;
  categoryName: string;
  current: number;
  max: number;
  gradientColors?: [string, string];
}

export const BudgetCapsule: React.FC<BudgetCapsuleProps> = ({
  emoji,
  categoryName,
  current,
  max,
  gradientColors = ['#8bdc6b', '#6bc98b'],
}) => {
  const pct = max > 0 ? Math.round((current / max) * 100) : 0;
  const isWarning = pct > 90;

  return (
    <div className={`budget-capsule ${isWarning ? 'budget-capsule--warning' : ''}`}>
      <span className="budget-capsule__emoji">{emoji}</span>
      <div className="budget-capsule__info">
        <div className="budget-capsule__top">
          <span className="budget-capsule__name">{categoryName}</span>
          <span className="budget-capsule__amounts">
            €{current.toLocaleString('de-DE')} / €{max.toLocaleString('de-DE')}
          </span>
          <span className={`budget-capsule__pct ${isWarning ? 'budget-capsule__pct--warning' : ''}`}>
            {pct}%
          </span>
        </div>
        <div className="budget-capsule__track">
          <div
            className="budget-capsule__fill"
            style={{
              width: `${Math.min(pct, 100)}%`,
              '--capsule-gradient': isWarning
                ? 'linear-gradient(90deg, #e87c7c, #F08080)'
                : `linear-gradient(90deg, ${gradientColors[0]}, ${gradientColors[1]})`,
            } as React.CSSProperties}
          />
        </div>
      </div>
    </div>
  );
};
```

- [ ] **Step 2: Commit**

```bash
git add src/components/BudgetCapsule.tsx
git commit -m "feat: add BudgetCapsule component with progress bar"
```

---

### Task 12: Create BalanceCard component

**Files:**
- Create: `src/components/BalanceCard.tsx` (full rewrite)

- [ ] **Step 1: Rewrite BalanceCard**

```tsx
import React from 'react';
import { OWNER_THEMES, type Owner, type BalanceData } from '../types';

interface BalanceCardProps extends BalanceData {
  className?: string;
}

export const BalanceCard: React.FC<BalanceCardProps> = ({
  owner,
  name,
  avatar,
  balance,
  monthChange,
  progress,
  sparkline,
  className = '',
}) => {
  const theme = OWNER_THEMES[owner];
  const maxBar = Math.max(...sparkline, 1);

  return (
    <div
      className={`balance-card balance-card--${owner} ${className}`}
      style={{
        '--owner-gradient': theme.gradientDiag,
        '--owner-glow': theme.glow,
        '--owner-dot': theme.dot,
      } as React.CSSProperties}
    >
      <div className="balance-card__top">
        <div className="balance-card__left">
          <div className="balance-card__dot" />
          <span className="balance-card__name">{name}</span>
        </div>
        <span className="balance-card__avatar">{avatar}</span>
      </div>

      <div className="balance-card__amount">
        €{Math.abs(balance).toLocaleString('de-DE', { minimumFractionDigits: 2 })}
      </div>

      <div className="balance-card__change">
        {monthChange >= 0 ? '+' : ''}{monthChange.toFixed(1)}% vs mes ant.
      </div>

      <div className="balance-card__progress">
        <div className="balance-card__track">
          <div
            className="balance-card__fill"
            style={{ width: `${Math.min(progress, 100)}%` }}
          />
        </div>
        <span className="balance-card__pct">{Math.round(progress)}%</span>
      </div>

      <div className="balance-card__sparkline">
        {sparkline.map((v, i) => (
          <div
            key={i}
            className="balance-card__bar"
            style={{
              height: `${(v / maxBar) * 100}%`,
              opacity: i === sparkline.length - 1 ? 0.85 : i === sparkline.length - 2 ? 0.5 : 0.25,
            }}
          />
        ))}
      </div>
    </div>
  );
};
```

- [ ] **Step 2: Commit**

```bash
git add src/components/BalanceCard.tsx
git commit -m "feat: rewrite BalanceCard with gradient owner themes and sparkline"
```

---

### Task 13: Create GoalCard component

**Files:**
- Create: `src/components/GoalCard.tsx`

- [ ] **Step 1: Create GoalCard component**

```tsx
import React from 'react';
import { OWNER_THEMES, type Goal } from '../types';

interface GoalCardProps extends Goal {
  onContribute?: () => void;
  onEdit?: () => void;
}

export const GoalCard: React.FC<GoalCardProps> = ({
  name,
  emoji,
  current,
  target,
  deadline,
  owner,
  onContribute,
  onEdit,
}) => {
  const theme = OWNER_THEMES[owner];
  const pct = target > 0 ? Math.round((current / target) * 100) : 0;

  return (
    <div
      className="goal-card"
      style={{
        '--owner-color': theme.base,
        '--owner-gradient': theme.gradient,
        '--owner-glow': theme.glow,
      } as React.CSSProperties}
    >
      <div className="goal-card__top">
        <span className="goal-card__emoji">{emoji}</span>
        <span className="goal-card__pct">{pct}%</span>
        {onEdit && (
          <button className="goal-card__edit" onClick={onEdit}>···</button>
        )}
      </div>

      <div className="goal-card__name">{name}</div>

      <div className="goal-card__amounts">
        €{current.toLocaleString('de-DE')} / €{target.toLocaleString('de-DE')}
      </div>

      <div className="goal-card__progress">
        <div className="goal-card__track">
          <div className="goal-card__fill" style={{ width: `${Math.min(pct, 100)}%` }} />
        </div>
      </div>

      <div className="goal-card__deadline">{deadline}</div>

      {onContribute && (
        <button className="goal-card__contribute" onClick={onContribute}>
          Contribuir
        </button>
      )}
    </div>
  );
};
```

- [ ] **Step 2: Commit**

```bash
git add src/components/GoalCard.tsx
git commit -m "feat: add GoalCard component with progress and contribute"
```

---

## Chunk 3: Layout Components (Sidebar, BottomNav)

### Task 14: Rewrite Sidebar

**Files:**
- Modify: `src/components/Sidebar.tsx` (full rewrite)

- [ ] **Step 1: Rewrite Sidebar**

```tsx
import React from 'react';
import { useLocation, useNavigate } from 'react-router-dom';
import { NavItem } from './NavItem';
import { useAuth } from '../auth';

const NAV_ITEMS = [
  { icon: 'house', label: 'Dashboard', path: '/' },
  { icon: 'circle-plus', label: 'Añadir Gasto', path: '/add' },
  { icon: 'chart-no-axes-column', label: 'Analíticas', path: '/analytics' },
  { icon: 'target', label: 'Objetivos', path: '/goals' },
];

const SECONDARY_NAV = [
  { icon: 'clock-arrow-up', label: 'Historial', path: '/history' },
  { icon: 'settings', label: 'Configuración', path: '/settings' },
];

export const Sidebar: React.FC = () => {
  const location = useLocation();
  const navigate = useNavigate();
  const { user } = useAuth();

  return (
    <aside className="sidebar">
      <div className="sidebar__logo">
        <div className="sidebar__logo-icon">N</div>
        <span className="sidebar__logo-text">nido</span>
      </div>

      <nav className="sidebar__nav">
        {NAV_ITEMS.map((item) => (
          <NavItem
            key={item.path}
            icon={item.icon}
            label={item.label}
            active={location.pathname === item.path}
            onClick={() => navigate(item.path)}
          />
        ))}
      </nav>

      <div className="sidebar__spacer" />

      <nav className="sidebar__nav">
        {SECONDARY_NAV.map((item) => (
          <NavItem
            key={item.path}
            icon={item.icon}
            label={item.label}
            active={location.pathname === item.path}
            onClick={() => navigate(item.path)}
          />
        ))}
      </nav>

      <div className="sidebar__profile">
        <div className="sidebar__avatar">
          {user?.username?.slice(0, 2).toUpperCase() || 'NI'}
        </div>
        <div className="sidebar__user">
          <span className="sidebar__username">
            {user?.username === 'samuel' ? 'Samuel' : user?.username === 'maria' ? 'María' : user?.username || 'Usuario'}
          </span>
          <span className="sidebar__role">Pareja</span>
        </div>
      </div>
    </aside>
  );
};
```

- [ ] **Step 2: Commit**

```bash
git add src/components/Sidebar.tsx
git commit -m "feat: rewrite Sidebar with Lucide icons and NavItem"
```

---

### Task 15: Rewrite BottomNav

**Files:**
- Modify: `src/components/BottomNav.tsx` (full rewrite)

- [ ] **Step 1: Rewrite BottomNav with 5 items and FAB**

```tsx
import React from 'react';
import { useLocation, useNavigate } from 'react-router-dom';
import { House, ChartNoAxesColumn, Plus, Target, Settings } from 'lucide-react';

export const BottomNav: React.FC = () => {
  const location = useLocation();
  const navigate = useNavigate();
  const isActive = (path: string) => location.pathname === path;

  return (
    <nav className="bottom-nav">
      <button
        className={`bottom-nav__item ${isActive('/') ? 'bottom-nav__item--active' : ''}`}
        onClick={() => navigate('/')}
      >
        <House size={22} />
        <span className="bottom-nav__label">Inicio</span>
      </button>

      <button
        className={`bottom-nav__item ${isActive('/analytics') ? 'bottom-nav__item--active' : ''}`}
        onClick={() => navigate('/analytics')}
      >
        <ChartNoAxesColumn size={22} />
        <span className="bottom-nav__label">Analíticas</span>
      </button>

      <button className="bottom-nav__fab" onClick={() => navigate('/add')}>
        <Plus size={24} color="#FFFFFF" />
      </button>

      <button
        className={`bottom-nav__item ${isActive('/goals') ? 'bottom-nav__item--active' : ''}`}
        onClick={() => navigate('/goals')}
      >
        <Target size={22} />
        <span className="bottom-nav__label">Objetivos</span>
      </button>

      <button
        className={`bottom-nav__item ${isActive('/settings') ? 'bottom-nav__item--active' : ''}`}
        onClick={() => navigate('/settings')}
      >
        <Settings size={22} />
        <span className="bottom-nav__label">Config</span>
      </button>
    </nav>
  );
};
```

- [ ] **Step 2: Commit**

```bash
git add src/components/BottomNav.tsx
git commit -m "feat: rewrite BottomNav with 5 items and FAB center"
```

---

### Task 16: Update Sidebar test

**Files:**
- Modify: `src/components/Sidebar.test.tsx`

- [ ] **Step 1: Rewrite test to match new Sidebar**

```tsx
import { describe, it, expect } from 'vitest';
import { render, screen } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { AuthProvider } from '../auth';
import { Sidebar } from './Sidebar';

const renderWithProviders = (initialEntries = ['/']) => {
  return render(
    <AuthProvider>
      <MemoryRouter initialEntries={initialEntries}>
        <Sidebar />
      </MemoryRouter>
    </AuthProvider>
  );
};

describe('Sidebar component', () => {
  it('renders sidebar with logo', () => {
    renderWithProviders();
    expect(screen.getByText('nido')).toBeInTheDocument();
  });

  it('renders main navigation links', () => {
    renderWithProviders();
    expect(screen.getByText('Dashboard')).toBeInTheDocument();
    expect(screen.getByText('Añadir Gasto')).toBeInTheDocument();
    expect(screen.getByText('Analíticas')).toBeInTheDocument();
    expect(screen.getByText('Objetivos')).toBeInTheDocument();
  });

  it('renders secondary navigation links', () => {
    renderWithProviders();
    expect(screen.getByText('Historial')).toBeInTheDocument();
    expect(screen.getByText('Configuración')).toBeInTheDocument();
  });

  it('highlights active nav item', () => {
    renderWithProviders(['/analytics']);
    const analyticsBtn = screen.getByText('Analíticas').closest('button');
    expect(analyticsBtn).toHaveClass('nav-item--active');
  });
});
```

- [ ] **Step 2: Run the test**

```bash
npx vitest run src/components/Sidebar.test.tsx
```

Expected: All tests pass

- [ ] **Step 3: Commit**

```bash
git add src/components/Sidebar.test.tsx
git commit -m "test: update Sidebar test for new nav structure"
```

---

## Chunk 4: Auth Extraction & Views (Login, PinPage, AddExpense)

### Task 17: Extract Login and PinPage from auth.tsx

**Files:**
- Create: `src/views/Login.tsx`
- Create: `src/views/PinPage.tsx`
- Modify: `src/auth.tsx` (remove LoginPage/PinPage component definitions, keep exports for backward compat)

- [ ] **Step 1: Create Login view**

Create `src/views/Login.tsx` with the split layout design. The component uses `useAuth()` hook for login logic. See spec Section 5 "Login" for full layout details.

Key structure:
- Left hero: dark gradient bg, decorative orbs (3 absolute-positioned blurred circles), logo box, tagline, subtitle, feature badges
- Right form: InputField for username, InputField for password, remember me checkbox, Button submit, error display
- Mobile: hero hidden via CSS media query, form full-width

The login logic is preserved from `auth.tsx`'s `LoginPage`: call `login(username, password)`, handle errors, show loading state.

```tsx
import React, { useState } from 'react';
import { useAuth } from '../auth';
import { InputField } from '../components/InputField';
import { Button } from '../components/Button';

export const Login: React.FC = () => {
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const { login } = useAuth();

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!username) { setError('Por favor ingresa tu usuario'); return; }
    if (!password) { setError('Por favor ingresa la contraseña'); return; }

    try {
      setIsLoading(true);
      setError('');
      await login(username, password);
    } catch (err: any) {
      setError(err.message);
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <div className="login">
      <div className="login__hero">
        <div className="login__orb login__orb--1" />
        <div className="login__orb login__orb--2" />
        <div className="login__orb login__orb--3" />
        <div className="login__logo">
          <div className="login__logo-icon">N</div>
          <span className="login__logo-text">nido</span>
        </div>
        <h1 className="login__tagline">Finanzas en pareja, simplificadas</h1>
        <p className="login__subtitle">
          Controla gastos compartidos, metas de ahorro y presupuestos juntos.
        </p>
        <div className="login__badges">
          <span className="login__badge">Gastos compartidos</span>
          <span className="login__badge">Presupuestos</span>
          <span className="login__badge">Metas de ahorro</span>
        </div>
      </div>

      <div className="login__form-section">
        <form className="login__form" onSubmit={handleSubmit}>
          <div className="login__form-header">
            <h2 className="login__form-title">Bienvenido</h2>
            <p className="login__form-subtitle">Inicia sesión en tu cuenta</p>
          </div>

          <div className="login__fields">
            <InputField
              label="USUARIO"
              placeholder="samuel o maria"
              value={username}
              onChange={setUsername}
              disabled={isLoading}
            />
            <InputField
              label="CONTRASEÑA"
              type="password"
              placeholder="Ingresa tu contraseña"
              value={password}
              onChange={setPassword}
              disabled={isLoading}
            />
          </div>

          {error && <div className="login__error">{error}</div>}

          <Button
            label={isLoading ? 'Entrando...' : 'Iniciar Sesión'}
            variant="samuel"
            type="submit"
            fullWidth
            disabled={isLoading}
          />
        </form>
      </div>
    </div>
  );
};
```

- [ ] **Step 2: Create PinPage view**

Create `src/views/PinPage.tsx` with neumorphic styling. Preserves all logic from `auth.tsx`'s `PinPage`.

```tsx
import React, { useState } from 'react';
import { useAuth } from '../auth';
import { NumpadKey } from '../components/NumpadKey';

export const PinPage: React.FC = () => {
  const [pin, setPin] = useState('');
  const [error, setError] = useState(false);
  const { user, verifyPin, logout } = useAuth();

  const handleNumberClick = (num: string) => {
    if (pin.length < 4) {
      const newPin = pin + num;
      setPin(newPin);
      if (newPin.length === 4) {
        handleVerify(newPin);
      }
    }
  };

  const handleDelete = () => {
    setPin(pin.slice(0, -1));
    setError(false);
  };

  const handleVerify = async (pinToVerify: string) => {
    const success = await verifyPin(pinToVerify);
    if (!success) {
      setError(true);
      setPin('');
    }
  };

  return (
    <div className="pin-page">
      <div className="pin-page__card">
        <div className="pin-page__logo">
          <div className="pin-page__logo-icon">N</div>
        </div>
        <p className="pin-page__greeting">
          Hola, {user?.username === 'samuel' ? 'Samuel' : 'María'}
        </p>

        <div className="pin-page__dots">
          {[0, 1, 2, 3].map((i) => (
            <div
              key={i}
              className={`pin-page__dot ${pin.length > i ? 'pin-page__dot--filled' : ''} ${error ? 'pin-page__dot--error' : ''}`}
            />
          ))}
        </div>

        <div className="pin-page__numpad">
          {[1, 2, 3, 4, 5, 6, 7, 8, 9].map((n) => (
            <NumpadKey key={n} label={n.toString()} onClick={() => handleNumberClick(n.toString())} />
          ))}
          <NumpadKey label="Salir" onClick={() => logout()} variant="default" />
          <NumpadKey label="0" onClick={() => handleNumberClick('0')} />
          <NumpadKey label="⌫" onClick={handleDelete} variant="delete" />
        </div>

        {error && <p className="pin-page__error">PIN incorrecto</p>}
      </div>
    </div>
  );
};
```

- [ ] **Step 3: Update auth.tsx — remove component definitions**

Remove the `LoginPage` and `PinPage` component definitions from `auth.tsx` (lines 114-268). Keep only the auth context logic (lines 1-112). The file should end after `export const AuthProvider`.

- [ ] **Step 4: Update App.tsx imports immediately (prevent compile break)**

Update `src/App.tsx` to import Login and PinPage from the new view files instead of from auth.tsx. This MUST happen in the same commit as the auth.tsx extraction to avoid a broken intermediate state.

In `src/App.tsx`, change:
```typescript
// OLD:
import { AuthProvider, useAuth, LoginPage, PinPage } from './auth';
// NEW:
import { AuthProvider, useAuth } from './auth';
import { Login } from './views/Login';
import { PinPage } from './views/PinPage';
```

Also update the JSX references:
```typescript
// OLD:
if (!isAuthenticated) { return <LoginPage />; }
// NEW:
if (!isAuthenticated) { return <Login />; }
```

- [ ] **Step 5: Verify it compiles**

```bash
npx tsc --noEmit 2>&1 | head -10
```

Expected: No errors related to LoginPage/PinPage imports

- [ ] **Step 6: Commit**

```bash
git add src/views/Login.tsx src/views/PinPage.tsx src/auth.tsx src/App.tsx
git commit -m "feat: extract Login and PinPage from auth.tsx into view files"
```

---

### Task 18: Rewrite AddExpense view

**Files:**
- Modify: `src/views/AddExpense.tsx` (full rewrite)

- [ ] **Step 1: Rewrite AddExpense with numpad design**

Rewrite `src/views/AddExpense.tsx` with the new bottom sheet + numpad design.

Key structure and code:

```tsx
import React, { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '../auth';
import { Api } from '../api';
import { format } from 'date-fns';
import { CATEGORIES, type Owner } from '../types';
import { CategoryPill } from '../components/CategoryPill';
import { NumpadKey } from '../components/NumpadKey';
import { Button } from '../components/Button';
import { Pencil } from 'lucide-react';

const OWNER_OPTIONS: { owner: Owner; label: string; emoji: string }[] = [
  { owner: 'shared', label: 'Compartido', emoji: '🏠' },
  { owner: 'samuel', label: 'Samuel', emoji: '👨‍💻' },
  { owner: 'maria', label: 'María', emoji: '👩‍🎨' },
];

const NUMPAD_ROWS = [
  ['1', '2', '3'],
  ['4', '5', '6'],
  ['7', '8', '9'],
  ['.', '0', '⌫'],
];

export const AddExpense: React.FC = () => {
  const { user } = useAuth();
  const navigate = useNavigate();
  const [amount, setAmount] = useState('0');
  const [description, setDescription] = useState('');
  const [category, setCategory] = useState('');
  const [owner, setOwner] = useState<Owner>('shared');
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  const [success, setSuccess] = useState(false);
  const [split, setSplit] = useState(50); // Visual-only

  const handleNumpad = (key: string) => {
    if (key === '⌫') {
      setAmount(prev => prev.length <= 1 ? '0' : prev.slice(0, -1));
      return;
    }
    if (key === '.' && amount.includes('.')) return;
    if (amount.includes('.') && amount.split('.')[1].length >= 2) return;
    setAmount(prev => prev === '0' && key !== '.' ? key : prev + key);
  };

  const handleSubmit = async () => {
    const num = parseFloat(amount);
    if (!num || num <= 0) { setError('Ingresa una cantidad'); return; }
    if (!category) { setError('¿En qué gastaste?'); return; }

    // Map owner pill to API fields
    const paid_by = owner === 'maria' ? 'maria' : owner === 'samuel' ? 'samuel' : (user?.username || 'samuel');
    const type = owner === 'shared' ? 'shared' : 'personal';

    try {
      setSaving(true);
      setError('');
      await Api.createExpense({
        amount: num,
        description: description.trim() || category,
        category,
        date: format(new Date(), 'yyyy-MM-dd'),
        paid_by,
        type,
      });
      setSuccess(true);
      setTimeout(() => navigate('/', { replace: true }), 600);
    } catch {
      setError('Error al guardar');
    } finally {
      setSaving(false);
    }
  };

  if (success) {
    return (
      <div className="add-expense">
        <div className="add-expense__success">
          <div className="add-expense__success-icon">✓</div>
          <div className="add-expense__success-text">Guardado</div>
        </div>
      </div>
    );
  }

  return (
    <div className="add-expense">
      <div className="add-expense__frame">
        <div className="add-expense__gradient-bg" />
        <div className="add-expense__sheet">
          <div className="add-expense__handle"><div className="add-expense__handle-bar" /></div>
          {/* Header with owner pills */}
          <div className="add-expense__header">
            <h2 className="add-expense__title">Nuevo Gasto</h2>
            <div className="add-expense__owner-pills">
              {OWNER_OPTIONS.map(o => (
                <button
                  key={o.owner}
                  className={`add-expense__owner-pill ${owner === o.owner ? 'add-expense__owner-pill--active' : ''}`}
                  onClick={() => setOwner(o.owner)}
                  style={{ '--pill-color': `var(--color-${o.owner})` } as React.CSSProperties}
                >
                  {o.emoji} {o.label}
                </button>
              ))}
            </div>
          </div>
          {/* Amount display */}
          <div className="add-expense__amount-box">
            <span className="add-expense__currency">€</span>
            <span className="add-expense__amount">{amount}</span>
          </div>
          {/* Categories */}
          <div className="add-expense__categories">
            {CATEGORIES.map(cat => (
              <CategoryPill
                key={cat.id}
                emoji={cat.emoji}
                name={cat.name}
                active={category === cat.id}
                onClick={() => setCategory(cat.id)}
              />
            ))}
          </div>
          {/* Description */}
          <div className="add-expense__desc">
            <Pencil size={16} color="var(--color-text-tertiary)" />
            <input
              className="add-expense__desc-input"
              placeholder="Añadir nota..."
              value={description}
              onChange={e => setDescription(e.target.value)}
            />
          </div>
          {/* Split slider (visual-only when shared) */}
          {owner === 'shared' && (
            <div className="add-expense__split">
              <span className="add-expense__split-pill add-expense__split-pill--samuel">👨‍💻 {split}%</span>
              <input
                type="range" min="0" max="100" value={split}
                onChange={e => setSplit(Number(e.target.value))}
                className="add-expense__split-slider"
              />
              <span className="add-expense__split-pill add-expense__split-pill--maria">👩‍🎨 {100 - split}%</span>
            </div>
          )}
          {error && <div className="add-expense__error">{error}</div>}
          {/* Numpad */}
          <div className="add-expense__numpad">
            {NUMPAD_ROWS.map((row, ri) => (
              <div key={ri} className="add-expense__numpad-row">
                {row.map(key => (
                  <NumpadKey
                    key={key}
                    label={key}
                    variant={key === '⌫' ? 'delete' : 'default'}
                    onClick={() => handleNumpad(key)}
                  />
                ))}
              </div>
            ))}
          </div>
          {/* CTA */}
          <div className="add-expense__cta">
            <Button
              label={saving ? 'Guardando...' : 'Guardar'}
              variant={owner}
              fullWidth
              onClick={handleSubmit}
              disabled={saving || amount === '0'}
            />
          </div>
        </div>
      </div>
    </div>
  );
};
```

- [ ] **Step 2: Verify it compiles**

```bash
npx tsc --noEmit 2>&1 | grep AddExpense | head -5
```

Expected: No errors

- [ ] **Step 3: Commit**

```bash
git add src/views/AddExpense.tsx
git commit -m "feat: rewrite AddExpense with numpad and owner pills"
```

---

### Task 19: Update AddExpenseSheet CATEGORIES import

**Files:**
- Modify: `src/components/AddExpenseSheet.tsx`

- [ ] **Step 1: Update import path**

Change line 4 of `AddExpenseSheet.tsx`:
```typescript
// OLD:
import { CATEGORIES } from './CategoryIcon';
// NEW:
import { CATEGORIES } from '../types';
```

Also update `cat.icon` references to `cat.emoji` throughout the file since the new CATEGORIES uses `emoji` instead of `icon`.

- [ ] **Step 2: Commit**

```bash
git add src/components/AddExpenseSheet.tsx
git commit -m "refactor: update AddExpenseSheet to use CATEGORIES from types"
```

---

## Chunk 5: Remaining Views (Dashboard, History, Settings, Analytics, Goals)

### Task 20: Rewrite Dashboard view

**Files:**
- Modify: `src/views/Dashboard.tsx` (full rewrite)

- [ ] **Step 1: Rewrite Dashboard**

Rewrite `src/views/Dashboard.tsx` with the new layout. Key structure:
- Header: greeting + "Resumen" title + search box + notification bell
- 3 BalanceCards in flex row (use existing `Api.getSummary()` data transformed to `BalanceData` format)
- Two-column split: BudgetCapsules (left) + TransactionRows (right)
- Skeleton loading state, error state with retry button, empty state

Preserve all data loading logic:
```
Promise.all([Api.getSummary(month), Api.getExpenses(month)])
```
Transform summary data to `BalanceData[]`:
- Samuel: `{ owner: 'samuel', balance: personal.samuel.budget - personal.samuel.spent, ... }`
- María: `{ owner: 'maria', balance: personal.maria.budget - personal.maria.spent, ... }`
- Compartido: `{ owner: 'shared', balance: spending.remainingShared, ... }`

Keep month navigation, refreshKey pattern, locale formatting.

Import: `BalanceCard`, `BudgetCapsule`, `TransactionRow`, `CATEGORIES`, `INDICATOR_COLORS` from types.

- [ ] **Step 2: Commit**

```bash
git add src/views/Dashboard.tsx
git commit -m "feat: rewrite Dashboard with BalanceCards, BudgetCapsules, TransactionRows"
```

---

### Task 21: Rewrite History view

**Files:**
- Modify: `src/views/History.tsx` (full rewrite)

- [ ] **Step 1: Rewrite History**

Rewrite `src/views/History.tsx` with the new design. Key changes:
- CategoryPill filter chips replace old filter buttons
- TransactionRow replaces ExpenseCard
- Summary pills as neumorphic elements
- Date group pills centered

Preserve all logic: filtering by category/paid_by/type, date grouping, delete with confirmation, month navigation.

- [ ] **Step 2: Commit**

```bash
git add src/views/History.tsx
git commit -m "feat: rewrite History with CategoryPills and TransactionRows"
```

---

### Task 22: Rewrite Settings view

**Files:**
- Modify: `src/views/Settings.tsx` (full rewrite)

- [ ] **Step 1: Rewrite Settings**

Rewrite `src/views/Settings.tsx` with two-column layout. Key structure:
- Left: Profile card + General settings + Notifications toggles
- Right: Partner card + Data export + Danger zone
- Mobile: single column stacked

Preserve all logic: budget editing, PIN management, CSV export, logout. Use InputField for budget inputs, Button for actions.

- [ ] **Step 2: Commit**

```bash
git add src/views/Settings.tsx
git commit -m "feat: rewrite Settings with two-column neumorphic layout"
```

---

### Task 23: Create Analytics view

**Files:**
- Create: `src/views/Analytics.tsx`

- [ ] **Step 1: Create Analytics**

Create `src/views/Analytics.tsx` with mock data. Key structure:
- Header with period selector pills (7D/1M/3M/6M/1A)
- SVG area chart with 3 series (samuel/maria/shared using owner colors)
- Right panel: 2 stat cards + category breakdown with progress bars
- Skeleton loading state

Mock data inline:
```typescript
const MOCK_CHART_DATA = {
  samuel: [2100, 1800, 2400, 1950, 2200, 2450],
  maria: [1600, 1900, 1700, 2100, 1800, 1890],
  shared: [3200, 2900, 3500, 3100, 3400, 3200],
};
const MOCK_MONTHS = ['Oct', 'Nov', 'Dic', 'Ene', 'Feb', 'Mar'];
```

- [ ] **Step 2: Commit**

```bash
git add src/views/Analytics.tsx
git commit -m "feat: add Analytics view with SVG chart and mock data"
```

---

### Task 24: Create Goals view

**Files:**
- Create: `src/views/Goals.tsx`

- [ ] **Step 1: Create Goals**

Create `src/views/Goals.tsx` with mock data. Key structure:
- Header with "Añadir meta" button
- 4 summary stat cards in flex row
- 2-column GoalCard grid + dashed "add goal" placeholder
- Skeleton loading state

Mock goals:
```typescript
const MOCK_GOALS: Goal[] = [
  { id: '1', name: 'Vacaciones Verano', emoji: '✈️', current: 3200, target: 5000, deadline: 'Jul 2026', owner: 'shared' },
  { id: '2', name: 'MacBook Pro', emoji: '💻', current: 1800, target: 3000, deadline: 'Sep 2026', owner: 'samuel' },
  { id: '3', name: 'Fondo Emergencia', emoji: '🛡️', current: 2500, target: 6000, deadline: 'Dic 2026', owner: 'shared' },
  { id: '4', name: 'Cámara Sony A7', emoji: '📸', current: 970, target: 1200, deadline: 'May 2026', owner: 'maria' },
];
```

- [ ] **Step 2: Commit**

```bash
git add src/views/Goals.tsx
git commit -m "feat: add Goals view with GoalCards and mock data"
```

---

## Chunk 6: Wiring & Cleanup

### Task 25: Final App.tsx update (add Analytics/Goals routes)

**Files:**
- Modify: `src/App.tsx`

Note: Login/PinPage imports were already updated in Task 17. This task adds the Analytics and Goals routes.

- [ ] **Step 1: Add Analytics and Goals imports and routes**

Add to imports:
```typescript
import { Analytics } from './views/Analytics';
import { Goals } from './views/Goals';
```

Add routes inside `<Routes>`:
```tsx
<Route path="/analytics" element={<Analytics />} />
<Route path="/goals" element={<Goals />} />
```

Update the loading screen to use neumorphic styling:
```tsx
if (isLoading) {
  return (
    <div className="loading-screen">
      <div className="loading-screen__logo">N</div>
      <div className="loading-screen__text">Cargando...</div>
    </div>
  );
}
```

- [ ] **Step 2: Commit**

```bash
git add src/App.tsx
git commit -m "feat: add Analytics and Goals routes to App"
```

---

### Task 26: Restyle existing components

**Files:**
- Modify: `src/components/DonutChart.tsx` — update CSS class names to use new tokens
- Modify: `src/components/SpendingTrend.tsx` — update CSS class names
- Modify: `src/components/ProfileAvatar.tsx` — update CSS class names
- Modify: `src/components/BottomSheet.tsx` — update CSS class names
- Modify: `src/components/AddExpenseSheet.tsx` — update CSS class names + CATEGORIES import

- [ ] **Step 1: Update each component's CSS class references**

For each component, replace old CSS class names and variable references with new ones. The logic stays identical — only class names change. Use the new neumorphic classes defined in `global.css`.

Key changes per component:
- `DonutChart`: Replace old color references with `CATEGORIES` colors from types, update font classes
- `SpendingTrend`: Replace bar colors with owner colors, update hover/active states
- `ProfileAvatar`: Update container classes for light bg
- `BottomSheet`: Remove `liquid-glass` class, use `.bottom-sheet` with neumorphic shadow
- `AddExpenseSheet`: Remove `liquid-glass` class, update `CATEGORIES` import, replace `cat.icon` with `cat.emoji`

- [ ] **Step 2: Commit**

```bash
git add src/components/DonutChart.tsx src/components/SpendingTrend.tsx src/components/ProfileAvatar.tsx src/components/BottomSheet.tsx src/components/AddExpenseSheet.tsx
git commit -m "refactor: restyle existing components for neumorphic design"
```

---

### Task 27: Delete deprecated components

**Files:**
- Delete: `src/components/CategoryIcon.tsx`
- Delete: `src/components/ExpenseCard.tsx`
- Delete: `src/components/BudgetBar.tsx`
- Delete: `src/components/PersonalCard.tsx`

- [ ] **Step 1: Verify no remaining imports**

```bash
grep -r "from.*CategoryIcon\|from.*ExpenseCard\|from.*BudgetBar\|from.*PersonalCard" src/ --include="*.tsx" --include="*.ts"
```

Expected: No results (all imports should already be updated)

- [ ] **Step 2: Delete the files**

```bash
rm src/components/CategoryIcon.tsx src/components/ExpenseCard.tsx src/components/BudgetBar.tsx src/components/PersonalCard.tsx
```

- [ ] **Step 3: Commit**

```bash
git add -u src/components/
git commit -m "chore: remove deprecated components (CategoryIcon, ExpenseCard, BudgetBar, PersonalCard)"
```

---

### Task 28: Final verification

- [ ] **Step 1: Verify no remaining old references**

```bash
grep -r "liquid-glass\|--bg-base\|--glass-bg\|--space-md\|--accent-glow\|Warm Nest" src/ --include="*.tsx" --include="*.ts" --include="*.css"
```

Expected: No matches (all old tokens and class names retired)

- [ ] **Step 2: TypeScript check**

```bash
npx tsc --noEmit
```

Expected: No errors

- [ ] **Step 3: Run unit tests**

```bash
npx vitest run
```

Expected: All tests pass

- [ ] **Step 4: Run e2e tests (if available)**

```bash
npm run test:ci 2>&1 | tail -20
```

Expected: All passing or no e2e suite configured

- [ ] **Step 5: Run dev server and visual checklist**

```bash
npm run client:dev
```

Verify EACH page on BOTH desktop and mobile viewport:

| Page | Desktop | Mobile |
|------|---------|--------|
| Login | Split layout (hero + form) | Form only, hero hidden |
| PinPage | Centered card with numpad dots | Same, full-width |
| Dashboard | 3 balance cards row, 2-col budget/transactions | Cards horizontal scroll, single column |
| AddExpense | Mobile frame centered (390px) | Full-width sheet |
| History | Filter chips, transaction rows, date groups | Same, single column |
| Settings | Two-column layout | Single column stacked |
| Analytics | Chart + right panel | Chart above, panel below |
| Goals | 2-col goal cards | Single column |
| BottomNav | Hidden (sidebar visible) | 5 items with FAB center |
| Sidebar | 260px dark, 6 nav items | Hidden |

- [ ] **Step 6: Commit any final fixes**

```bash
git add -A
git commit -m "fix: final migration adjustments after visual review"
```

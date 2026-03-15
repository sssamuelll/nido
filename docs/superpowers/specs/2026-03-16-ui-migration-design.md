# Nido UI Migration: Neumorphic Light Redesign

**Date:** 2026-03-16
**Status:** Approved
**Approach:** Big Bang — full rewrite of UI layer in single pass

## Overview

Migrate Nido from the current "Warm Nest" dark glass-morphism design to the new neumorphic light design delivered by the UI/UX team (reference: `/Documents/nido-components`). Preserve all existing business logic (API, auth, data flow) and the current accent color palette. Adopt new layout, typography, shadows, icons, and components.

## Constraints

- **Preserve:** `api.ts` — zero changes to backend contract
- **Preserve:** `auth.tsx` — auth context logic (login, logout, PIN verify, token management) stays intact. The embedded `LoginPage` and `PinPage` components will be extracted to `views/Login.tsx` and `views/PinPage.tsx` respectively, and `auth.tsx` will be updated to remove those component definitions. The auth *logic* (context, provider, hooks) is unchanged.
- **Preserve:** Accent colors (Samuel=#8bdc6b, María=#ff8c6b, Compartido=#7cb5e8, category colors, semantic colors)
- **Adopt:** Neumorphic light mode, Fraunces/Outfit/JetBrains Mono fonts, Lucide icons, all 6 pages from reference
- **Styling:** CSS with variables (rewrite `global.css`), not inline styles. Dynamic owner colors via CSS variables inline. All old CSS variable names (e.g., `--bg-base`, `--space-md`, `--glass-bg`) are fully retired. No old token names persist.
- **Currency:** Euro (€) throughout. The `$` sign in the reference design is replaced with `€`.
- **Locale:** Spanish (`es`) locale for all date formatting via `date-fns`, consistent with current behavior.

## 1. Design Tokens (global.css rewrite)

### Color System

```css
/* Backgrounds */
--color-bg: #F0F1F7;
--color-surface: #ECEEF4;

/* Text */
--color-text-primary: #1A1A2E;
--color-text-secondary: #6B6B80;
--color-text-tertiary: #9999AA;

/* Owner colors (preserved from current Nido) */
--color-samuel: #8bdc6b;
--color-samuel-light: #9de382;
--color-samuel-deep: #6bc98b;

--color-maria: #ff8c6b;
--color-maria-light: #ffaa8c;
--color-maria-deep: #e87c7c;

--color-shared: #7cb5e8;
--color-shared-light: #96c8f0;
--color-shared-deep: #5a9ecc;

/* Category colors (preserved) */
--color-cat-restaurant: #ff8c6b;
--color-cat-gastos: #7cb5e8;
--color-cat-servicios: #c4a0e8;
--color-cat-ocio: #e87ca0;
--color-cat-inversion: #a6c79c;
--color-cat-otros: #a89e94;

/* Semantic (preserved) */
--color-success: #a6c79c;
--color-danger: #e87c7c;
--color-warning: #e8c77c;

/* UI elements */
--color-sidebar: #1A1A2E;
--color-divider: #D4D7E3;  /* used for dividers, inactive toggles, borders */

/* Glass (for GoalCard) */
--color-glass-bg: rgba(255, 255, 255, 0.55);
--color-glass-border: rgba(255, 255, 255, 0.70);
```

### Owner Theme Objects (TypeScript)

Defined in `src/types/index.ts`:

```typescript
export const OWNER_THEMES = {
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
```

### Typography

```css
--font-display: 'Fraunces', Georgia, serif;
--font-body: 'Outfit', system-ui, sans-serif;
--font-mono: 'JetBrains Mono', 'Courier New', monospace;
```

Google Fonts loaded in `index.html` (replace existing Inter/DM Sans imports):
- Fraunces: ital,opsz,wght@0,9..144,400;0,9..144,600;0,9..144,700;1,9..144,400
- Outfit: wght@300;400;500;600;700
- JetBrains Mono: wght@400;500;600

Remove the existing Inter font import from `index.html`.

### Spacing

```css
--space-1: 4px;
--space-2: 8px;
--space-3: 12px;
--space-4: 16px;
--space-5: 20px;
--space-6: 24px;
--space-8: 32px;
--space-9: 36px;
```

### Border Radius

```css
--radius-xs: 6px;
--radius-sm: 8px;
--radius-md: 12px;
--radius-lg: 14px;
--radius-xl: 16px;
--radius-2xl: 20px;
--radius-full: 9999px;
```

### Neumorphic Shadows

```css
--shadow-neu-xs: 2px 2px 5px #D4D7E3, -2px -2px 5px #FFFFFF;
--shadow-neu-sm: 2px 2px 6px #D4D7E3, -2px -2px 6px #FFFFFF;
--shadow-neu: 4px 4px 10px #D4D7E3, -4px -4px 10px #FFFFFF;
--shadow-neu-lg: 6px 6px 14px #D4D7E3, -6px -6px 14px #FFFFFF;
--shadow-card: 0 12px 32px rgba(100, 86, 140, 0.12), 0 2px 8px rgba(0, 0, 0, 0.06);
```

### Transitions

```css
--transition-fast: 100ms ease;
--transition-base: 150ms ease;
--transition-slow: 300ms ease;
```

## 2. File Structure

```
src/
├── styles/
│   └── global.css              # REWRITE: all tokens + component classes
│
├── types/
│   └── index.ts                # NEW: Owner, OwnerTheme, OWNER_THEMES, CATEGORIES,
│                               #   Goal, BalanceData, Transaction, BudgetCategory, etc.
│
├── components/
│   ├── Sidebar.tsx             # REWRITE: Lucide icons, dark bg, NavItem children
│   ├── BottomNav.tsx           # REWRITE: 5 items, neumorphic, FAB center
│   ├── BalanceCard.tsx         # REWRITE: gradient card, sparkline, progress
│   ├── BudgetCapsule.tsx       # NEW: replaces BudgetBar
│   ├── TransactionRow.tsx      # NEW: replaces ExpenseCard
│   ├── CategoryPill.tsx        # NEW: pill-style category selector
│   ├── NumpadKey.tsx           # NEW: neumorphic numpad key
│   ├── GoalCard.tsx            # NEW: savings goal card
│   ├── Button.tsx              # NEW: owner-variant button
│   ├── InputField.tsx          # NEW: neumorphic input
│   ├── NavItem.tsx             # NEW: sidebar nav item with Lucide
│   ├── DonutChart.tsx          # RESTYLE: keep SVG logic, new classes
│   ├── AnimatedNumber.tsx      # KEEP: no changes
│   ├── ProfileAvatar.tsx       # RESTYLE: keep logic, new classes
│   ├── AvatarCropper.tsx       # KEEP: canvas logic unchanged
│   ├── BottomSheet.tsx         # RESTYLE: keep drag logic, new classes
│   ├── AddExpenseSheet.tsx     # KEEP: Dashboard quick-add overlay (restyled). Opens from
│   │                           #   Dashboard FAB on mobile. Uses same API as AddExpense view.
│   │                           #   The CATEGORIES import moves to src/types/index.ts.
│   └── SpendingTrend.tsx       # RESTYLE: keep bar logic, new classes
│
├── views/
│   ├── Dashboard.tsx           # REWRITE UI: 3 BalanceCards, BudgetCapsules, TransactionRows
│   ├── History.tsx             # REWRITE UI: TransactionRows, CategoryPill filters
│   ├── Settings.tsx            # REWRITE UI: 2-col layout, toggles, danger zone
│   ├── AddExpense.tsx          # REWRITE UI: numpad, owner pills, amount display
│   ├── Analytics.tsx           # NEW: SVG area chart, period selector, stats
│   ├── Goals.tsx               # NEW: goal cards grid, summary stats
│   ├── Login.tsx               # NEW FILE: extracted from auth.tsx, split layout redesign
│   └── PinPage.tsx             # NEW FILE: extracted from auth.tsx, restyled for light mode
│
├── App.tsx                     # UPDATE: add /analytics, /goals routes; import Login/PinPage from views/
├── auth.tsx                    # UPDATE: remove LoginPage/PinPage component definitions (keep auth logic)
├── api.ts                      # NO CHANGES
└── main.tsx                    # UPDATE: font imports
```

### Files to DELETE:
- `src/components/CategoryIcon.tsx` — `CATEGORIES` constant moves to `src/types/index.ts`
- `src/components/ExpenseCard.tsx` — replaced by TransactionRow
- `src/components/BudgetBar.tsx` — replaced by BudgetCapsule
- `src/components/PersonalCard.tsx` — absorbed into BalanceCard

### New dependency:
- `lucide-react` — icon library for sidebar and UI elements

## 3. Layout System

### Mobile (<1024px)
- No sidebar
- BottomNav fixed with 5 items: Dashboard, Analytics, AddExpense (FAB), Goals, Settings
- History accessible from Dashboard "Ver todas" button
- Content: full-width, `padding-bottom: 6rem` for nav clearance
- Safe area: `env(safe-area-inset-bottom)`
- Balance cards: horizontal scroll with snap (`overflow-x: auto; scroll-snap-type: x mandatory`), min-width 280px per card

### Desktop (≥1024px)
- Sidebar: 260px fixed width, `position: sticky`, `top: 0`, dark background `#1A1A2E`
- BottomNav: hidden
- Content: `flex: 1`, `overflow: auto`, `padding: 32px 36px`
- Layout: `display: flex; height: 100vh; background: var(--color-bg);`
- Balance cards: 3 cards in flex row, `gap: 20px`, `flex: 1` each

### BottomNav FAB (Mobile AddExpense)
- **Position:** Center of BottomNav, raised 12px above the nav bar
- **Size:** 56x56px, circular (`border-radius: 50%`)
- **Background:** `linear-gradient(180deg, #8bdc6b, #6bc98b)` (samuel/accent gradient)
- **Shadow:** `0 4px 16px rgba(139, 220, 107, 0.35)`
- **Icon:** Lucide `Plus` icon, 24px, white
- **Behavior:** Navigates to `/add` route (full page AddExpense view)
- **The other 4 nav items** sit at normal height, 2 on each side of the FAB

### Sidebar Icon-Route Mapping

| Lucide Icon | Label | Route |
|------------|-------|-------|
| `House` | Dashboard | `/` |
| `CirclePlus` | Añadir Gasto | `/add` |
| `ChartNoAxesColumn` | Analíticas | `/analytics` |
| `Target` | Objetivos | `/goals` |
| `ClockArrowUp` | Historial | `/history` |
| `Settings` | Configuración | `/settings` |

### Sidebar Structure
- Logo: 36x36 gradient box (`linear-gradient(225deg, #8bdc6b, #9de382)`) + "nido" text (Fraunces 22px)
- Main nav (first 4 items)
- Spacer (`flex: 1`)
- Secondary nav (Historial, Configuración)
- User profile: gradient avatar (samuel→maria gradient) + name + "Pareja" subtitle

### Routes

```
/login     → Login (no sidebar, no nav)
/pin       → PinPage (no sidebar, no nav)
/          → Dashboard
/history   → History
/settings  → Settings
/add       → AddExpense
/analytics → Analytics (NEW)
/goals     → Goals (NEW)
```

## 4. Component Specifications

### CSS Class Pattern
- Structure and tokens via CSS classes
- Dynamic owner colors via CSS variables inline: `style={{ '--owner-color': theme.base } as React.CSSProperties}`
- BEM-light naming: `.component`, `.component--variant`, `.component__child`

### Component Classes

| Component | Base Class | Variants | Dynamic CSS Vars |
|-----------|-----------|----------|-----------------|
| Button | `.btn` | `.btn--samuel`, `.btn--maria`, `.btn--shared`, `.btn--sm` | — |
| InputField | `.input-field` | `.input-field--focused` | — |
| BalanceCard | `.balance-card` | `.balance-card--samuel`, `--maria`, `--shared` | `--owner-gradient`, `--owner-glow`, `--owner-dot` |
| BudgetCapsule | `.budget-capsule` | `.budget-capsule--warning` | `--capsule-gradient` |
| TransactionRow | `.transaction-row` | — | `--indicator-color` |
| CategoryPill | `.category-pill` | `.category-pill--active` | — |
| NumpadKey | `.numpad-key` | `.numpad-key--action`, `--delete` | — |
| GoalCard | `.goal-card` | — | `--owner-color`, `--owner-gradient`, `--owner-glow` |
| NavItem | `.nav-item` | `.nav-item--active` | — |

### Key Component Details

**BalanceCard:** Gradient background per owner, contains: indicator dot, name label (uppercase 11px), avatar emoji, balance amount (Fraunces 42px), month change (mono 12px), progress bar (6px track), sparkline (36px height bars).

**BudgetCapsule:** Neumorphic container, emoji (20px), category name + amounts, percentage badge, progress bar (12px height, gradient fill, neumorphic track). Warning state when >90%.

**TransactionRow:** Neumorphic container, left indicator bar (3px width, owner color), emoji (20px), name + payer, amount (mono) + date. Amount color: danger for negative, success for positive. Date formatted with Spanish locale (`date-fns` + `es` locale).

**NumpadKey:** 72x52px, neumorphic shadow, pressed state with inset shadow + scale(0.94). Action variant uses samuel gradient. Delete uses Lucide `Delete` icon.

**CategoryPill:** Pill shape (border-radius: 9999px), emoji + name. Active state: samuel gradient background, white text, glow shadow.

**Button:** Gradient background per owner variant, 14px border-radius, press scale(0.98). Sizes: sm (10px 20px, 13px text) and md (14px 28px, 15px text).

**GoalCard:** Glass-morphism card (rgba white bg, backdrop blur), emoji, percentage, name, amounts (mono), progress bar, deadline, contribute button with owner gradient.

## 5. Page Specifications

### Dashboard (`/`)
- **Header:** Greeting (Outfit 14px) + title "Resumen" (Fraunces 28px 700) | Search box (neumorphic) + notification bell
- **Balance cards row:** 3 BalanceCards (Samuel/María/Compartido). Desktop: flex row `gap: 20px`. Mobile: horizontal scroll with snap, min-width 280px per card.
- **Content split:** Budget column (BudgetCapsules, `gap: 16px`) | Transactions column (TransactionRows, `gap: 12px`)
- **Data source:** `Api.getSummary(month)` + `Api.getExpenses(month)` — transform to BalanceData format
- **Month navigation:** Preserved from current
- **Loading state:** Skeleton placeholders matching card dimensions (neumorphic pulsing)
- **Error state:** Centered message with retry button (Button component)
- **Empty state:** Friendly message when no data for selected month

### AddExpense (`/add`)
- **Mobile frame style on desktop** (390px width, 40px border-radius, centered)
- **Bottom sheet** with handle bar, slides up from below gradient overlay
- **Sheet header:** Title (Fraunces 22px) + owner pills (3 buttons: Compartido/Samuel/María)
- **Owner pills control both `type` and `paid_by`:** Compartido → `{type: 'shared', paid_by: 'samuel'}` (default). Samuel → `{type: 'personal', paid_by: 'samuel'}`. María → `{type: 'personal', paid_by: 'maria'}`.
- **Amount display:** Neumorphic box, `€` prefix (mono 36px) + amount (mono 44px)
- **Category scroll:** Horizontal CategoryPills
- **Description:** InputField with Lucide `Pencil` icon
- **Split slider:** Visual-only informational display. Shows the 50/50 split ratio when owner=shared. Does NOT create separate expense records — the API does not support splits. The slider is non-functional in v1; it is a visual placeholder for a future feature. When owner is Samuel or María (personal), the slider is hidden.
- **Numpad:** 4 rows x 3 keys. Row 4: ".", "0", confirm (action variant)
- **CTA:** Full-width Button (owner variant)
- **Logic preserved:** Amount validation (>0, 2 decimal max), category required, `Api.createExpense()`, autocomplete from `Api.getCategories()`, success animation (600ms)
- **Relationship with AddExpenseSheet:** `AddExpense.tsx` is the full-page view at `/add` with the numpad. `AddExpenseSheet.tsx` remains as the Dashboard quick-add bottom sheet overlay (legacy behavior). Both call `Api.createExpense()`. They are independent components.

### History (`/history`)
- **Header:** Subtitle + title "Historial" | Month navigation
- **Summary pills:** Count, total, average (neumorphic)
- **Filters:** CategoryPills row + paid-by chips + type chips
- **Transaction list:** Date pills (centered) + TransactionRows grouped by date
- **Logic preserved:** Client-side filtering, date grouping (Spanish locale: "Hoy", "Ayer", day name), delete with confirmation
- **Loading state:** Skeleton rows
- **Empty state:** 📭 icon when no expenses, 🔍 when filters return nothing

### Settings (`/settings`)
- **Two columns** (`flex: 1` left | 420px right). On mobile: single column, stacked.
- **Left:** Profile card (avatar gradient + name) | General settings (currency display) | Notifications (toggles)
- **Right:** Partner card (Samuel + María with status badges) | Data export (CSV button, same logic as current) | Danger zone (red bg, delete/logout buttons)
- **Logic preserved:** Budget editing, PIN management, CSV export, logout
- **Currency select:** Display-only for now (€ EUR hardcoded). Placeholder for future multi-currency support.

### Login (`/login`)
- **Extracted from auth.tsx** to `views/Login.tsx`
- **Split layout:** Hero (flex: 1, dark gradient `#1A1A2E → #2A2850`) | Form (520px, light bg)
- **Hero:** Decorative blur orbs (3, positioned absolute), logo (gradient box + "nido"), tagline (Fraunces 44px), subtitle, feature badges
- **Form:** Title (Fraunces 28px), InputFields (username + password), remember me + forgot password, login Button (samuel variant), divider, sign up link
- **Logic preserved:** `Api.login()`, token + user storage, auth context. User selection (Samuel/María) is now handled by typing the username.
- **Mobile:** Hero hidden, form full-width
- **Loading state:** Button shows spinner during login request
- **Error state:** Red text below form on invalid credentials

### PinPage (`/pin`)
- **Extracted from auth.tsx** to `views/PinPage.tsx`
- **Centered layout** on light background
- **4-digit PIN display** with neumorphic dot indicators
- **NumpadKey grid** for input
- **Logic preserved:** `Api.verifyPin()`, unlock state in auth context

### Analytics (`/analytics`) — NEW
- **Header:** Subtitle + title "Analíticas" | Period selector pills (7D/1M/3M/6M/1A, neumorphic)
- **Content split:** Chart card (flex: 1, SVG area chart 3 series) | Right panel (360px, stat cards + category breakdown)
- **Chart:** SVG with gradient fills per owner, line strokes, month labels (mono 11px)
- **Stats:** 2 cards (Gasto promedio, Total mes) with delta indicators
- **Categories:** Progress bars with category colors
- **Data:** Mock data inline in component until backend endpoint exists. Uses `AnalyticsData` type from `src/types/index.ts`.
- **Loading state:** Skeleton chart area + skeleton stat cards
- **Empty state:** "No hay datos suficientes" message

### Goals (`/goals`) — NEW
- **Header:** Subtitle + title "Objetivos" | Add goal Button
- **Summary grid:** 4 stat cards (total saved, active goals, streak, next milestone)
- **Goals grid:** 2 columns, GoalCards + "add goal" placeholder (dashed border)
- **Data:** Mock data inline in component until backend endpoint exists. Uses `Goal` type from `src/types/index.ts`.
- **Loading state:** Skeleton goal cards
- **Empty state:** Centered illustration-style message encouraging adding first goal

## 6. Type Definitions (`src/types/index.ts`)

```typescript
export type Owner = 'samuel' | 'maria' | 'shared';

export interface OwnerTheme {
  base: string;
  light: string;
  deep: string;
  gradient: string;
  gradientDiag: string;
  glow: string;
  dot: string;
}

export interface User {
  id: number;
  name: string;
  avatar: string;
  owner: Owner;
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

// CATEGORIES constant (migrated from CategoryIcon.tsx)
export const CATEGORIES = [
  { id: 'restaurant', name: 'Restaurant', emoji: '🍽️', color: '#ff8c6b' },
  { id: 'gastos', name: 'Gastos', emoji: '🛒', color: '#7cb5e8' },
  { id: 'servicios', name: 'Servicios', emoji: '💡', color: '#c4a0e8' },
  { id: 'ocio', name: 'Ocio', emoji: '🎉', color: '#e87ca0' },
  { id: 'inversion', name: 'Inversión', emoji: '📈', color: '#a6c79c' },
  { id: 'otros', name: 'Otros', emoji: '🦋', color: '#a89e94' },
];

export const NEU_SHADOW = {
  xs: '2px 2px 5px #D4D7E3, -2px -2px 5px #FFFFFF',
  sm: '2px 2px 6px #D4D7E3, -2px -2px 6px #FFFFFF',
  md: '4px 4px 10px #D4D7E3, -4px -4px 10px #FFFFFF',
  lg: '6px 6px 14px #D4D7E3, -6px -6px 14px #FFFFFF',
};

// OWNER_THEMES defined here (see Section 1)
```

## 7. HTML & PWA Updates (`index.html`)

- **Remove:** Inter / DM Sans Google Font imports
- **Add:** Fraunces, Outfit, JetBrains Mono Google Font imports
- **Remove:** Inline SVG `<filter id="liquid-glass-filter">` block and all `liquid-glass` class references
- **Update:** `<meta name="theme-color" content="#F0F1F7">` (match new light background)
- **Service Worker:** Vite PWA plugin handles cache busting via content hashing. No special SW changes needed, but verify after migration that the SW update triggers correctly with new assets.

## 8. Migration Checklist

1. Install `lucide-react`
2. Update `index.html`: new fonts, remove old fonts, remove liquid-glass SVG filter, update theme-color
3. Create `src/types/index.ts` with all types, OWNER_THEMES, CATEGORIES, NEU_SHADOW
4. Rewrite `src/styles/global.css` with all new tokens and component classes (retire all old variable names)
5. Create new components: Button, InputField, NavItem, NumpadKey, CategoryPill, BalanceCard, BudgetCapsule, TransactionRow, GoalCard
6. Rewrite Sidebar with Lucide icons and NavItem
7. Rewrite BottomNav with 5 items, FAB center, neumorphic style
8. Restyle existing components: DonutChart, SpendingTrend, ProfileAvatar, BottomSheet, AddExpenseSheet
9. Extract LoginPage and PinPage from `auth.tsx` into `views/Login.tsx` and `views/PinPage.tsx`
10. Rewrite views: Dashboard, AddExpense, History, Settings
11. Create new views: Analytics, Goals
12. Update App.tsx routes (add /analytics, /goals; update Login/PinPage imports)
13. Update main.tsx
14. Delete deprecated components: CategoryIcon, ExpenseCard, BudgetBar, PersonalCard
15. Update or rewrite `Sidebar.test.tsx` and any other broken tests
16. Run e2e tests to verify functionality
17. Visual review of all pages (desktop + mobile)

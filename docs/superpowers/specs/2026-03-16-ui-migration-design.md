# Nido UI Migration: Neumorphic Light Redesign

**Date:** 2026-03-16
**Status:** Approved
**Approach:** Big Bang — full rewrite of UI layer in single pass

## Overview

Migrate Nido from the current "Warm Nest" dark glass-morphism design to the new neumorphic light design delivered by the UI/UX team (reference: `/Documents/nido-components`). Preserve all existing business logic (API, auth, data flow) and the current accent color palette. Adopt new layout, typography, shadows, icons, and components.

## Constraints

- **Preserve:** `api.ts`, `auth.tsx` — zero changes to backend contract and auth flow
- **Preserve:** Accent colors (Samuel=#8bdc6b, María=#ff8c6b, Compartido=#7cb5e8, category colors, semantic colors)
- **Adopt:** Neumorphic light mode, Fraunces/Outfit/JetBrains Mono fonts, Lucide icons, all 6 pages from reference
- **Styling:** CSS with variables (rewrite `global.css`), not inline styles. Dynamic owner colors via CSS variables inline.

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

/* Sidebar */
--color-sidebar: #1A1A2E;

/* Glass */
--color-glass-bg: rgba(255, 255, 255, 0.55);
--color-glass-border: rgba(255, 255, 255, 0.70);
```

### Owner Theme Objects (TypeScript)

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

Google Fonts loaded in `index.html`:
- Fraunces: ital,opsz,wght@0,9..144,400;0,9..144,600;0,9..144,700;1,9..144,400
- Outfit: wght@300;400;500;600;700
- JetBrains Mono: wght@400;500;600

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
--shadow-dark: #D4D7E3;  /* used for dividers and inactive toggles */
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
│   └── index.ts                # NEW: Owner, OwnerTheme, Goal, BalanceData, etc.
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
│   ├── AddExpenseSheet.tsx     # RESTYLE: keep keyboard logic, new classes
│   └── SpendingTrend.tsx       # RESTYLE: keep bar logic, new classes
│
├── views/
│   ├── Dashboard.tsx           # REWRITE UI: 3 BalanceCards, BudgetCapsules, TransactionRows
│   ├── History.tsx             # REWRITE UI: TransactionRows, CategoryPill filters
│   ├── Settings.tsx            # REWRITE UI: 2-col layout, toggles, danger zone
│   ├── AddExpense.tsx          # REWRITE UI: bottom sheet, numpad, owner pills, split slider
│   ├── Analytics.tsx           # NEW: SVG area chart, period selector, stats
│   ├── Goals.tsx               # NEW: goal cards grid, summary stats
│   └── Login.tsx               # REWRITE: split layout (hero + form)
│
├── App.tsx                     # UPDATE: add /analytics, /goals routes
├── auth.tsx                    # NO CHANGES
├── api.ts                      # NO CHANGES
└── main.tsx                    # UPDATE: font imports
```

### Files to DELETE:
- `src/components/CategoryIcon.tsx` — replaced by emojis + CategoryPill
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

### Desktop (≥1024px)
- Sidebar: 260px fixed width, `position: sticky`, `top: 0`, dark background `#1A1A2E`
- BottomNav: hidden
- Content: `flex: 1`, `overflow: auto`, `padding: 32px 36px`
- Layout: `display: flex; height: 100vh; background: var(--color-bg);`

### Sidebar Structure
- Logo: 36x36 gradient box (`linear-gradient(225deg, #8bdc6b, #9de382)`) + "nido" text (Fraunces 22px)
- Nav items (6): House, CirclePlus, ChartNoAxesColumn, Target, ClockArrowUp, Settings
- Spacer
- User profile: gradient avatar + name + subtitle

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

**TransactionRow:** Neumorphic container, left indicator bar (3px width, owner color), emoji (20px), name + payer, amount (mono) + date. Amount color: danger for negative, success for positive.

**NumpadKey:** 72x52px, neumorphic shadow, pressed state with inset shadow + scale(0.94). Action variant uses samuel gradient. Delete uses Lucide `Delete` icon.

**CategoryPill:** Pill shape (border-radius: 9999px), emoji + name. Active state: samuel gradient background, white text, glow shadow.

**Button:** Gradient background per owner variant, 14px border-radius, press scale(0.98). Sizes: sm (10px 20px, 13px text) and md (14px 28px, 15px text).

**GoalCard:** Glass-morphism card (rgba white bg, backdrop blur), emoji, percentage, name, amounts (mono), progress bar, deadline, contribute button with owner gradient.

## 5. Page Specifications

### Dashboard (`/`)
- **Header:** Greeting (Outfit 14px) + title "Resumen" (Fraunces 28px 700) | Search box (neumorphic) + notification bell
- **Balance cards row:** 3 BalanceCards (Samuel/María/Compartido) horizontal, `gap: 20px`
- **Content split:** Budget column (BudgetCapsules, `gap: 16px`) | Transactions column (TransactionRows, `gap: 12px`)
- **Data source:** `Api.getSummary(month)` + `Api.getExpenses(month)` — transform to BalanceData format
- **Month navigation:** Preserved from current

### AddExpense (`/add`)
- **Mobile frame style on desktop** (390px width, 40px border-radius, centered)
- **Bottom sheet** with handle bar, slides up from below gradient overlay
- **Sheet header:** Title (Fraunces 22px) + owner pills (3 buttons: Compartido/Samuel/María)
- **Amount display:** Neumorphic box, `$` prefix (mono 36px) + amount (mono 44px)
- **Category scroll:** Horizontal CategoryPills
- **Description:** InputField with search icon
- **Split slider:** Samuel pill (% + emoji) | range input | María pill (only visible when owner=shared)
- **Numpad:** 4 rows x 3 keys, last row has confirm button (action variant)
- **CTA:** Full-width Button (owner variant)
- **Logic preserved:** Amount validation, `Api.createExpense()`, autocomplete, success animation

### History (`/history`)
- **Header:** Subtitle + title "Historial" | Month navigation
- **Summary pills:** Count, total, average (neumorphic)
- **Filters:** CategoryPills row + paid-by chips + type chips
- **Transaction list:** Date pills (centered) + TransactionRows grouped by date
- **Logic preserved:** Client-side filtering, date grouping, delete with confirmation

### Settings (`/settings`)
- **Two columns** (`flex: 1` left | 420px right)
- **Left:** Profile card (avatar gradient + name) | General settings (currency select, theme) | Notifications (toggles)
- **Right:** Partner card (Samuel + María with status badges) | Data export (CSV + JSON buttons) | Danger zone (red bg, delete buttons)
- **Logic preserved:** Budget editing, PIN management, CSV export, logout

### Login (`/login`)
- **Split layout:** Hero (flex: 1, dark gradient) | Form (520px, light bg)
- **Hero:** Decorative blur orbs, logo (gradient box + "nido"), tagline (Fraunces 44px), subtitle, feature badges
- **Form:** Title (Fraunces 28px), InputFields (username + password), remember me + forgot, login Button, divider, social buttons, sign up link
- **Logic preserved:** `Api.login()`, token + user storage, auth context

### Analytics (`/analytics`) — NEW
- **Header:** Subtitle + title "Analíticas" | Period selector pills (7D/1M/3M/6M/1A, neumorphic)
- **Content split:** Chart card (flex: 1, SVG area chart 3 series) | Right panel (360px, stat cards + category breakdown)
- **Chart:** SVG with gradient fills per owner, line strokes, month labels (mono 11px)
- **Stats:** 2 cards (Gasto promedio, Total mes) with delta indicators
- **Categories:** Progress bars with category colors
- **Data:** Mock data until backend endpoint exists

### Goals (`/goals`) — NEW
- **Header:** Subtitle + title "Objetivos" | Add goal Button
- **Summary grid:** 4 stat cards (total saved, active goals, streak, next milestone)
- **Goals grid:** 2 columns, GoalCards + "add goal" placeholder (dashed border)
- **Data:** Mock data until backend endpoint exists

## 6. Migration Checklist

1. Install `lucide-react`
2. Add Google Fonts to `index.html`
3. Create `src/types/index.ts` with Owner, OwnerTheme, OWNER_THEMES, interfaces
4. Rewrite `src/styles/global.css` with all new tokens and component classes
5. Create new components: Button, InputField, NavItem, NumpadKey, CategoryPill, BalanceCard, BudgetCapsule, TransactionRow, GoalCard
6. Rewrite Sidebar with Lucide icons and NavItem
7. Rewrite BottomNav with 5 items and neumorphic style
8. Restyle existing components: DonutChart, SpendingTrend, ProfileAvatar, BottomSheet, AddExpenseSheet
9. Rewrite views: Login, Dashboard, AddExpense, History, Settings
10. Create new views: Analytics, Goals
11. Update App.tsx routes
12. Update main.tsx / index.html
13. Delete deprecated components: CategoryIcon, ExpenseCard, BudgetBar, PersonalCard
14. Run e2e tests to verify functionality
15. Visual review of all pages

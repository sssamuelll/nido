# Nido - Issue Tracker

This file tracks bugs, improvements, and feature requests for the Nido expense tracking app.

> **Note:** These issues are for internal tracking. Once prioritized, they can be moved to GitHub Issues.

---

## 🔐 Security

### [SEC-001] Hardcoded JWT Secret
- **Description:** Default JWT secret is embedded in source code (`auth.ts`).
- **Risk:** Low in production if env var is set, but default could be exploited.
- **Fix:** Ensure `JWT_SECRET` is always set via environment variable; remove default or use a secure fallback. **Implemented** – Added config.ts with Zod validation, removed hardcoded default, env var now required (≥32 chars).
- **Priority:** High
- **Status:** Implemented (2026‑02‑27)

### [SEC-002] Default Password
- **Description:** Default password is `changeme` (or from `DEFAULT_PASSWORD` env).
- **Risk:** Users may not change it, leading to weak authentication.
- **Fix:** Force password change on first login, or require strong password during initial setup. **Implemented** – Updated db.ts to generate random password in development, log warning, remove hardcoded `changeme`. Added validation in config.ts (≥8 chars, not default example).
- **Priority:** Medium
- **Status:** Implemented (2026‑02‑27)

### [SEC-003] SQL Injection Protection
- **Description:** Queries use parameterized queries (good), but some dynamic parts (category filtering) could be risky if extended.
- **Risk:** Low (currently safe).
- **Fix:** Maintain current pattern; add audit note to avoid string interpolation.
- **Priority:** Low

---

## 🐛 Bugs & Defects

### [BUG-001] Missing Input Validation
- **Description:** Some endpoints lack validation (e.g., `amount` can be negative, `date` format not checked).
- **Impact:** Data corruption, incorrect calculations.
- **Fix:** Add validation middleware (e.g., Zod) or manual checks. **Implemented** – Created `validation.ts` with Zod schemas for expenses and budgets; added middleware to all relevant endpoints (POST/PUT expenses, PUT budgets, month query param); validates amount positivity, date/month formats, enum values, budget sum constraints.
- **Priority:** Medium
- **Status:** Implemented (2026‑02‑27)

### [BUG-002] Error Messages Expose Stack Traces
- **Description:** In development, errors may leak stack traces to API responses.
- **Impact:** Information disclosure.
- **Fix:** Use error middleware that hides details in production.
- **Priority:** Low

### [BUG-003] Budget Defaults Hardcoded
- **Description:** Default budget values are hardcoded in `db.ts` and `budgets.ts`.
- **Impact:** Not configurable per user/environment.
- **Fix:** Move to config file or environment variables.
- **Priority:** Low

---

## 🚀 Features & Enhancements

### [FEAT-001] User Registration & Management
- **Description:** Currently only two hardcoded users (samuel, maria). No registration flow.
- **Benefit:** Allow other couples to use the app.
- **Implementation:** Add `/api/auth/register`, user profiles, password reset.
- **Priority:** Medium

### [FEAT-002] Data Export (CSV/PDF)
- **Description:** Export expenses, budgets, reports.
- **Benefit:** Backup, tax reporting, analysis.
- **Implementation:** Add `/api/export/csv`, frontend button.
- **Priority:** Medium

### [FEAT-003] Custom Categories
- **Description:** Categories are fixed (`Restaurant`, `Gastos`, …).
- **Benefit:** Personalization.
- **Implementation:** New `categories` table, UI to manage.
- **Priority:** Low

### [FEAT-004] Recurring Expenses
- **Description:** Schedule repeating expenses (rent, subscriptions).
- **Benefit:** Automation, forecasting.
- **Implementation:** New `recurring_expenses` table, cron job.
- **Priority:** Low

### [FEAT-005] Notifications & Reminders
- **Description:** Notify users about upcoming bills, budget overruns.
- **Benefit:** Proactive management.
- **Implementation:** Email/push notifications, background worker.
- **Priority:** Low

### [FEAT-006] Bank Integration (Read‑Only)
- **Description:** Import transactions via Open Banking/CSV upload.
- **Benefit:** Reduce manual entry.
- **Implementation:** Partner with Plaid, Salt Edge, or manual CSV parser.
- **Priority:** Low (complex)

### [FEAT-007] Advanced Charts & Reports
- **Description:** More visualizations (trends, year‑over‑year, forecasting).
- **Benefit:** Better insights.
- **Implementation:** Use Chart.js/D3, new report endpoints.
- **Priority:** Low

### [FEAT-008] Multi‑Currency Support
- **Description:** Handle expenses in different currencies.
- **Benefit:** For international couples/travel.
- **Implementation:** Add `currency` field, exchange rates API.
- **Priority:** Low

---

## 🛠 Technical Debt

### [TECH-001] Deprecated Dependencies
- **Description:** Multiple npm packages are deprecated (see `npm install` warnings).
- **Impact:** Security vulnerabilities, potential breakage.
- **Fix:** Audit and update packages; replace deprecated ones.
- **Priority:** Medium

### [TECH-002] TypeScript `any` Usage
- **Description:** Several `any` types in routes, `db.ts`.
- **Impact:** Reduced type safety.
- **Fix:** Add proper interfaces/types.
- **Priority:** Low

### [TECH-003] No Unit/Integration Tests
- **Description:** No test suite exists.
- **Impact:** Regression risk, hard to refactor.
- **Fix:** Add Jest/Vitest, test critical paths (auth, expenses). **Implemented** – Installed Vitest + dependencies, configured vitest.config.ts, added tests for config validation (14 tests) and auth module (8 tests), all passing. Frontend component tests pending.
- **Priority:** High
- **Status:** Implemented (2026‑02‑27)

### [TECH-004] CI/CD Improvements
- **Description:** GitHub Actions workflow could use caching, separate build/test stages.
- **Impact:** Longer build times, missed test opportunities.
- **Fix:** Add `npm test` step, cache `node_modules`, parallel jobs.
- **Priority:** Medium

### [TECH-005] Database Migrations
- **Description:** Schema changes are applied via `CREATE IF NOT EXISTS`; no versioned migrations.
- **Impact:** Difficult to roll back, team collaboration issues.
- **Fix:** Use migration tool (e.g., `knex`, `db-migrate`).
- **Priority:** Low

### [TECH-006] Environment Configuration
- **Description:** Mix of `.env`, hardcoded values, and defaults.
- **Impact:** Configuration drift.
- **Fix:** Use `dotenv` consistently, validate required vars at startup.
- **Priority:** Low

### [TECH-007] Logging Structure
- **Description:** Console.log used throughout.
- **Impact:** Hard to monitor in production.
- **Fix:** Use structured logger (pino, winston).
- **Priority:** Low

---

## 🎨 UI/UX Improvements

### [UI-001] Responsive Design Audit
- **Description:** Ensure mobile‑first design works on all screen sizes.
- **Impact:** User experience on tablets/desktop.
- **Fix:** Test with Chrome DevTools, adjust breakpoints.
- **Priority:** Medium

### [UI-002] Accessibility (a11y)
- **Description:** Check ARIA labels, color contrast, keyboard navigation.
- **Impact:** Inclusive design.
- **Fix:** Audit with axe‑devtools, fix violations.
- **Priority:** Low

### [UI-003] Loading States & Skeletons
- **Description:** Missing loading indicators for async operations.
- **Impact:** Perceived performance.
- **Fix:** Add spinners/skeleton placeholders.
- **Priority:** Low

### [UI-004] Dark/Light Theme
- **Description:** Only one theme (dark?).
- **Impact:** User preference.
- **Fix:** Add theme toggle, CSS variables.
- **Priority:** Low

### [UI-005] Tablet & Desktop Views
- **Description:** Current mobile‑first design lacks optimized layouts for tablet (≥768px) and desktop (≥1024px). Need to adapt components (Dashboard, History, AddExpense) and navigation for larger screens.
- **Impact:** Poor user experience on tablets and desktops; wasted screen space.
- **Fix:** Define breakpoints, create responsive layouts (grids, sidebars, multi‑column), adapt BottomNav for tablet/desktop (maybe top nav or sidebar), test across viewports. **Implemented** – Added tablet (≥768px) and desktop (≥1024px) media queries in global.css, created Sidebar component, updated App.tsx layout, adjusted dashboard grid, preserved mobile‑first approach.
- **Priority:** High (for user engagement on non‑mobile devices)
- **Status:** Implemented (2026‑02‑27)

---

## 📚 Documentation

### [DOC-001] API Documentation
- **Description:** No OpenAPI/Swagger spec.
- **Impact:** Hard for third‑party integration.
- **Fix:** Generate OpenAPI spec (tsoa, swagger‑ui).
- **Priority:** Low

### [DOC-002] Setup & Deployment Guide
- **Description:** README has minimal setup instructions.
- **Impact:** Hard for new developers to onboard.
- **Fix:** Expand README with dev, test, deploy steps.
- **Priority:** Medium

### [DOC-003] Architecture Decision Records (ADR)
- **Description:** No record of technical decisions.
- **Impact:** Future maintainers lack context.
- **Fix:** Create `docs/adr/` with template.
- **Priority:** Low

---

## ⚙️ Infrastructure

### [INF-001] Backup Strategy
- **Description:** SQLite database has no automated backup.
- **Impact:** Data loss risk.
- **Fix:** Daily backup to cloud storage (S3, Backblaze).
- **Priority:** Medium

### [INF-002] Monitoring & Alerts
- **Description:** No monitoring of server health, errors, performance.
- **Impact:** Reactive instead of proactive.
- **Fix:** Add health checks, error tracking (Sentry), metrics (Prometheus).
- **Priority:** Low

### [INF-003] Dockerize Application
- **Description:** No containerization.
- **Impact:** Deployment flexibility.
- **Fix:** Create `Dockerfile`, `docker‑compose.yml`.
- **Priority:** Low

---

## 📊 Prioritization Matrix

| Priority | Issues |
|----------|--------|
| **High** | SEC‑001, TECH‑003 |
| **Medium** | SEC‑002, BUG‑001, TECH‑001, TECH‑004, UI‑001, DOC‑002, INF‑001 |
| **Low** | All others |

---

## 📝 How to Use

1. **Discuss** each issue with the team.
2. **Estimate** effort (S/M/L).
3. **Move to GitHub** when ready for development (use `gh issue create`).
4. **Update** this file when issues are resolved or reprioritized.

---

*Last updated: 2026‑02‑26*  
*Maintainer: Samuel (sssamuelll@gmail.com)*
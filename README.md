# Nido

Mobile-first expense tracking app for couples. Built for two people who share a life and need to know where the money goes without spreadsheets.

## What it does

- Shared and personal expense tracking with category budgets
- Billing cycles that start when you decide (not on the 1st of the month)
- Budget approval flow — one partner proposes a change, the other approves
- Recurring expense templates
- Savings goals with contribution tracking
- Full history with filters by category, context, and date range
- Passwordless login via WebAuthn passkeys (biometrics, device PIN)

## Stack

- **Frontend:** React, TypeScript, Vite (PWA)
- **Backend:** Express, Node.js, TypeScript
- **Database:** SQLite
- **Auth:** WebAuthn passkeys + app-managed sessions (no external auth provider)
- **Deploy:** GitHub Actions, rsync to VPS, nginx reverse proxy

## Running locally

```bash
cp .env.example .env
# Fill in your credentials and allowed emails
npm install
npm run dev
```

The dev server runs frontend (Vite) and backend (Express) concurrently on port 3100.

## Environment variables

See `.env.example` for the full list.

## Deploy

A push to `main` triggers a GitHub Actions workflow that builds, rsyncs to the server, and restarts the service. See `.github/workflows/deploy.yml`.

## License

Private project. Source visible for reference.

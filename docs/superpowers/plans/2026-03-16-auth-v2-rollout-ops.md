# Nido Auth V2 — Rollout / Ops Notes

Date: 2026-03-16
Status: Active

## Production values currently in use

These belong in server-only secrets / `.env`, never in git:

- `APP_BASE_URL=https://nido.sdar.dev`
- `APP_SESSION_DAYS=30`
- `APP_SESSION_COOKIE_NAME=nido_session`
- `SUPABASE_URL=<project url>`
- `SUPABASE_ANON_KEY=<public anon key>`
- `MAGIC_LINK_ALLOWED_EMAILS=samuel@example.com,maria@example.com`

## Production auth stack
- Nido app on EC2 behind nginx + systemd
- Express backend with `trust proxy = 1`
- Supabase Auth for identity
- Resend-backed SMTP for auth emails
- SQLite app DB with self-healing auth session schema

## Deploy model
- Merge to `main`
- GitHub Actions deploy to production
- systemd restarts `nido.service`

## Important production checks after auth changes

### 1. Health
- `GET /api/health` must return `ok`

### 2. Auth config
- `GET /api/auth/config` should reflect whether magic-link auth is enabled

### 3. Magic-link send
- allowed email -> success or transparent upstream rate-limit error
- non-allowed email -> 403

### 4. Magic-link confirm
- fresh link should hit `/auth/confirm`
- backend should verify token and create Nido session
- frontend should not loop confirm calls

## Failure patterns seen during rollout

### Weak JWT secret
Symptom:
- app fails to boot after stricter validation

Fix:
- rotate to strong secret in prod `.env`

### DB not ready on startup
Symptom:
- auth/login endpoints return 500 right after deploy/restart

Fix:
- init DB before `listen()`

### Generic 502 masking upstream auth errors
Symptom:
- frontend sees fake bad gateway instead of real auth/rate-limit error

Fix:
- preserve real Supabase statuses/messages where possible

### Broken magic-link redirect behavior
Symptom:
- email returns to site root instead of callback/confirm route

Fix:
- use token-hash flow with `/auth/confirm`
- use custom email template instead of relying on `ConfirmationURL`

### Confirm loop in frontend
Symptom:
- many repeated `/confirm` requests from one page load

Fix:
- one-shot confirmation promise cache keyed by token hash + type

### Legacy schema mismatch
Symptom:
- `table sessions has no column named user_agent`

Fix:
- self-healing startup migration + runtime retry path

## Recommended next documentation improvements
- add screenshots for Supabase setup
- add a dedicated troubleshooting page for auth
- add a post-deploy checklist for Nido production

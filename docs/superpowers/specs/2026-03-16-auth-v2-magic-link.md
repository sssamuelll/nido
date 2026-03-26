# Nido Auth V2 — Magic Link + Secure Sessions + Local Unlock

Date: 2026-03-16
Status: Active rollout
Owner: Samuel

## Goal
Replace the legacy username/password auth with a simpler and more secure system for a two-person app:

- email-based magic link login
- secure HttpOnly app sessions managed by Nido
- optional local biometric/PIN unlock later
- minimal friction for Samuel and María

## Final architecture chosen

### Identity
Supabase Auth handles:
- email identity
- magic-link token issuance
- token-hash verification

### Email delivery
Supabase uses a custom SMTP provider.
Recommended and currently configured path: **Resend**.

### App session
Nido backend handles:
- allowlist checks
- local app user mapping / sync
- household/domain authorization
- Nido session creation in SQLite
- HttpOnly session cookie

## Current production flow

### Send link
1. User enters email in Nido.
2. Backend checks email allowlist.
3. Backend requests Supabase magic link.
4. Supabase sends email through configured SMTP.

### Confirm link
1. Email link points to:
   `{{ .SiteURL }}/auth/confirm?token_hash={{ .TokenHash }}&type=email`
2. Frontend route `/auth/confirm` reads `token_hash` and `type`.
3. Frontend calls Nido `POST /api/auth/magic-link/confirm`.
4. Backend verifies token with Supabase `/auth/v1/verify`.
5. Backend extracts verified access token / user identity.
6. Backend enforces allowlist.
7. Backend finds or creates the local app user.
8. Backend creates Nido HttpOnly session cookie.
9. Frontend redirects into the app.

## Why this flow
We stopped depending on `{{ .ConfirmationURL }}` because it was too opaque for Nido's custom auth/session bridge. The token-hash flow is explicit, documented by Supabase, and gives Nido control over the post-email login completion.

## Required env vars

```env
JWT_SECRET=...
APP_BASE_URL=https://nido.sdar.dev
APP_SESSION_DAYS=30
APP_SESSION_COOKIE_NAME=nido_session
SUPABASE_URL=https://your-project.supabase.co
SUPABASE_ANON_KEY=...
MAGIC_LINK_ALLOWED_EMAILS=samuel@example.com,maria@example.com
```

Optional:

```env
SUPABASE_SERVICE_ROLE_KEY=...
DEFAULT_PASSWORD=...
DATABASE_URL=...
```

## Supabase dashboard setup

### Email provider
- Enable Email provider
- Allow new users to sign up
- Confirm email can stay enabled

### URL configuration
Site URL:

```txt
https://nido.sdar.dev
```

Redirect URLs:

```txt
https://nido.sdar.dev/auth/confirm
http://localhost:3100/auth/confirm
http://localhost:5173/auth/confirm
http://127.0.0.1:5173/auth/confirm
```

### Magic link email template
Use this exact template:

```html
<h2>Magic Link</h2>
<p>Follow this link to login:</p>
<p><a href="{{ .SiteURL }}/auth/confirm?token_hash={{ .TokenHash }}&type=email">Log In</a></p>
```

Do not use `{{ .ConfirmationURL }}` for the Nido flow.

### SMTP
Recommended:
- use Resend or another transactional provider
- do not self-host SMTP on the app server unless there is a strong reason

## Allowlist policy
Nido is private. Magic-link login is restricted to the couple's approved emails.

Current policy:
- only emails in `MAGIC_LINK_ALLOWED_EMAILS` may request or complete magic-link login
- non-allowlisted addresses get `403`

## Session storage
Nido stores app sessions in SQLite.

Important notes:
- production DBs may have legacy schema
- startup now self-heals missing `sessions.user_agent`
- session creation also retries after repairing that column if needed

## Auth reliability fixes already made

### Fixed
- canonical `/api/auth/me`
- frontend cookie-session bootstrap as source of truth
- DB initialization before accepting traffic
- magic-link error surfacing with real upstream status codes
- trust proxy for nginx deployment
- email allowlist enforcement
- token-hash confirm flow instead of brittle redirect-only flow
- one-shot confirm attempt to stop frontend retry loops
- legacy schema self-heal for `sessions.user_agent`

### Remaining polish items
- improve UI copy for auth errors/rate limits
- add device-local quick unlock later (PIN/biometric)
- consider session management UX (logout all devices)
- consider session expiration messaging in UI

## Rollout summary

### PR 1
- canonical `/api/auth/me`
- frontend auth bootstrap cleanup

### PR 2
- schema groundwork (`households`, `app_users`, `sessions`, identity backfills)

### PR 3
- staged Supabase integration + legacy fallback

### Subsequent hotfixes
- allowlist for couple-only access
- better auth error surfacing
- token-hash `/auth/confirm` flow
- auth confirm stability fixes (schema self-heal + one-shot confirm)

## Operational guidance

### If `/api/auth/me` returns 401
That is normal when the user is not logged in yet.

### If magic-link start returns 429
This is usually upstream rate limiting from Supabase Auth / mail sending. Surface it clearly in UI and avoid repeated retries.

### If auth confirm fails repeatedly
Check:
- the email template still uses `token_hash`
- `/auth/confirm` URL is correct
- the token is fresh (magic links are one-time / expiring)
- allowlist contains the exact verified user email
- production DB schema has been healed at startup

## Security notes
- keep allowlisted emails in server env only
- never commit real `.env`
- rotate exposed secrets after debugging sessions
- rotate Resend API keys if pasted into chat or logs

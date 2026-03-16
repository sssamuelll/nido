# Nido

Shared expense tracker for Samuel and María.

## Current auth status

Nido now supports a staged auth-v2 setup:

- **Primary path:** email magic link via Supabase Auth
- **App session:** Nido creates its own HttpOnly session cookie after Supabase verification
- **Fallback path:** legacy username/password login remains available when Supabase is not configured or during rollout
- **Access control:** only allowlisted emails can use magic-link auth

## Auth architecture

### Identity
Supabase Auth handles:
- email delivery
- magic link / token hash verification
- email identity

### App session
Nido backend handles:
- allowlist enforcement
- local app user creation/sync
- HttpOnly cookie session creation
- domain authorization

### Magic link flow
Nido uses the token-hash confirmation flow recommended by Supabase:

1. User requests a magic link with their email.
2. Supabase sends an email containing a link to `/auth/confirm`.
3. The frontend reads `token_hash` and `type` from the URL.
4. Nido backend verifies the token with Supabase.
5. Nido creates its own app session cookie.
6. User lands in the app as an authenticated Nido user.

## Required environment variables
See `.env.example` for the full list.

Core variables:

```env
JWT_SECRET=...
APP_BASE_URL=https://nido.sdar.dev
APP_SESSION_DAYS=30
APP_SESSION_COOKIE_NAME=nido_session
SUPABASE_URL=https://your-project.supabase.co
SUPABASE_ANON_KEY=...
MAGIC_LINK_ALLOWED_EMAILS=samueldarioballesteros@gmail.com,marac88@gmail.com
```

Optional:

```env
SUPABASE_SERVICE_ROLE_KEY=...
DEFAULT_PASSWORD=...
DATABASE_URL=...
```

## Supabase setup

### Authentication
In Supabase:
- enable **Email** provider
- allow new users to sign up
- confirm email can remain enabled

### URL configuration
Use:

- Site URL: your app base URL
- Redirect URLs:
  - `https://nido.sdar.dev/auth/confirm`
  - `http://localhost:3100/auth/confirm`
  - `http://localhost:5173/auth/confirm` if needed in local frontend flows
  - `http://127.0.0.1:5173/auth/confirm` if needed

### Email template
For the magic-link email template, use:

```html
<h2>Magic Link</h2>
<p>Follow this link to login:</p>
<p><a href="{{ .SiteURL }}/auth/confirm?token_hash={{ .TokenHash }}&type=email">Log In</a></p>
```

Do **not** depend on `{{ .ConfirmationURL }}` for the custom Nido flow.

### SMTP
Recommended: use a transactional provider like Resend instead of self-hosted SMTP.

## Production notes

### Reverse proxy
Nido runs behind nginx. Express is configured with:

```ts
app.set('trust proxy', 1)
```

This is required for correct client IP handling and to avoid `express-rate-limit` proxy warnings.

### Legacy database compatibility
Nido now self-heals legacy DBs on startup for auth-v2 session storage, including adding missing `sessions.user_agent` when needed.

### Deploy
Production deploys via GitHub Actions.
A merge to `main` triggers build + deploy to the server.

## Important rollout decisions

### Why allowlist exists
Supabase can send the magic link, but Nido still restricts login to the explicitly allowed couple emails. This keeps the app private while using a standard passwordless flow.

### Why Nido creates its own session
Supabase proves identity; Nido still owns:
- app session cookie
- user mapping
- household/domain permissions

This keeps app authorization inside Nido instead of pushing domain logic into Supabase.

## Known operational gotchas fixed during rollout

These issues were found and addressed during auth-v2 rollout:

- stale frontend auth state caused false "logged in but 401" behavior
- backend accepted traffic before DB init finished
- broken GitHub Gemini workflows caused unrelated CI noise
- magic-link errors were being flattened into generic 502s instead of returning real auth/rate-limit statuses
- raw REST redirect handling was unreliable for this flow; switched to token-hash confirm flow
- frontend `/auth/confirm` retry loop caused repeated confirm calls
- legacy production DB schema lacked `sessions.user_agent`

## Recommended next docs to read
- `.env.example`
- `docs/superpowers/specs/2026-03-16-auth-v2-magic-link.md` (auth-v2 design)

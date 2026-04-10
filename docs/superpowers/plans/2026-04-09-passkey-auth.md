# Passkey Auth — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace Supabase magic link auth with WebAuthn passkeys, making Nido fully self-contained with zero external dependencies.

**Architecture:** Server uses `@simplewebauthn/server` for WebAuthn ceremonies. Credentials stored in `passkey_credentials` table. Existing session management (HttpOnly cookies, `sessions` table) stays unchanged. PIN remains as fallback. Invitation system for onboarding new users/devices.

**Tech Stack:** `@simplewebauthn/server`, `@simplewebauthn/browser`, SQLite, Express, React

**Spec:** `docs/superpowers/specs/2026-04-09-passkey-auth-remove-supabase.md`

---

### Task 1: Install Dependencies & Update Config

**Files:**
- Modify: `package.json`
- Modify: `server/config.ts`
- Modify: `.env.example`

- [ ] **Step 1: Install WebAuthn packages**

```bash
npm install @simplewebauthn/server @simplewebauthn/browser
```

- [ ] **Step 2: Replace Supabase env vars with APP_ORIGIN in `server/config.ts`**

Remove `SUPABASE_URL`, `SUPABASE_ANON_KEY`, `SUPABASE_SERVICE_ROLE_KEY` from the schema and all getters/exports. Replace `MAGIC_LINK_ALLOWED_EMAILS` with `ALLOWED_EMAILS`. Add `APP_ORIGIN` (defaults to `APP_BASE_URL`).

The env schema should become:
```typescript
const envSchema = z.object({
  NODE_ENV: z.enum(['development', 'production', 'test']).default('development'),
  PORT: z.string().regex(/^\d+$/).transform(Number).default('3100'),
  DATABASE_URL: z.string().optional(),
  APP_BASE_URL: z.string().url().default('http://localhost:3100'),
  APP_ORIGIN: z.string().url().optional(),
  ALLOWED_EMAILS: z.string().optional(),
  APP_SESSION_DAYS: z.string().regex(/^\d+$/).transform(Number).default('30'),
  APP_SESSION_COOKIE_NAME: z.string().min(1).default('nido_session'),
  ALLOWED_ORIGINS: z.string().min(1).optional(),
});
```

Add getters:
```typescript
get appOrigin(): string {
  return this.config.APP_ORIGIN ?? this.config.APP_BASE_URL;
}

get allowedEmails(): string[] {
  return (this.config.ALLOWED_EMAILS ?? '')
    .split(',').map(e => e.trim().toLowerCase()).filter(Boolean);
}
```

Remove getters: `supabaseUrl`, `supabaseAnonKey`, `supabaseServiceRoleKey`, `magicLinkAllowedEmails`.

Update exports to match.

- [ ] **Step 3: Update `.env.example`**

Remove Supabase section. Add `APP_ORIGIN` with documentation. Rename `MAGIC_LINK_ALLOWED_EMAILS` to `ALLOWED_EMAILS`.

- [ ] **Step 4: Update local `.env`**

Add `APP_ORIGIN=http://localhost:3100` (or the production URL). Remove Supabase vars.

- [ ] **Step 5: Verify config compiles**

```bash
npx tsc --noEmit -p server/tsconfig.json
```

- [ ] **Step 6: Commit**

```bash
git add package.json package-lock.json server/config.ts .env.example
git commit -m "feat: replace Supabase config with APP_ORIGIN for passkey auth"
```

---

### Task 2: Database — New Tables

**Files:**
- Modify: `server/db.ts`

- [ ] **Step 1: Add `passkey_credentials` and `device_invitations` tables to the CREATE TABLE block**

Add after the `sessions` table definition:

```sql
CREATE TABLE IF NOT EXISTS passkey_credentials (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  app_user_id INTEGER NOT NULL REFERENCES app_users(id) ON DELETE CASCADE,
  credential_id TEXT NOT NULL UNIQUE,
  public_key TEXT NOT NULL,
  sign_count INTEGER NOT NULL DEFAULT 0,
  transports TEXT,
  device_name TEXT,
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS device_invitations (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  household_id INTEGER NOT NULL REFERENCES households(id) ON DELETE CASCADE,
  invited_by_user_id INTEGER NOT NULL REFERENCES app_users(id),
  token TEXT NOT NULL UNIQUE,
  expires_at DATETIME NOT NULL,
  relink_user_id INTEGER REFERENCES app_users(id),
  used_at DATETIME,
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP
);
```

- [ ] **Step 2: Verify compiles, commit**

---

### Task 3: Backend — WebAuthn Auth Routes

**Files:**
- Create: `server/routes/passkey-auth.ts`
- Modify: `server/index.ts`

This is the core backend task. Create all passkey auth endpoints in a dedicated router.

- [ ] **Step 1: Create `server/routes/passkey-auth.ts`**

This file contains:

**`GET /setup-status`** — returns `{ hasUsers, needsPasskeyMigration }`
- `hasUsers`: `SELECT COUNT(*) FROM app_users` > 0
- `needsPasskeyMigration`: has users but `SELECT COUNT(*) FROM passkey_credentials` = 0

**`POST /setup/start`** — first-time setup, creates household + user, returns registration options
- Fails if any app_users exist
- Creates household (name: "Mi hogar", slug: "primary")
- Creates app_user with given username
- Creates legacy `users` row with random password and default PIN (for PIN fallback)
- Returns `generateRegistrationOptions()` from `@simplewebauthn/server` with:
  - `rpName: 'Nido'`
  - `rpID: new URL(appOrigin).hostname`
  - `userID` based on app_user.id
  - `userName: username`
  - `attestationType: 'none'`
  - `authenticatorSelection: { residentKey: 'preferred', userVerification: 'preferred' }`
- Stores the challenge in a temporary in-memory Map (keyed by app_user.id, expires 5min)

**`POST /setup/finish`** — verifies registration, stores credential, creates session
- Body: `{ userId, credential }`
- Calls `verifyRegistrationResponse()` from `@simplewebauthn/server`
- Stores in `passkey_credentials`: credential_id, public_key (base64url), sign_count, transports, device_name (from user-agent)
- Calls `createAppSession()`, `setAppSessionCookie()`
- Returns `{ user }`

**`POST /register/start`** — requires auth. Returns registration options for current user.
- Same as setup/start but for existing authenticated user
- Used for adding additional passkeys

**`POST /register/finish`** — requires auth. Verifies and stores new credential.
- Same as setup/finish but for existing authenticated user

**`POST /login/start`** — no auth. Returns authentication options.
- Fetches all credentials from `passkey_credentials`
- Returns `generateAuthenticationOptions()` with `allowCredentials` populated
- Stores challenge in memory Map

**`POST /login/finish`** — no auth. Verifies assertion, creates session.
- Body: `{ credential }`
- Finds credential by credential_id in DB
- Calls `verifyAuthenticationResponse()` from `@simplewebauthn/server`
- Updates `sign_count` in DB
- Looks up app_user via credential's app_user_id
- Creates session + cookie, returns `{ user }`

**`POST /invite`** — requires auth. Creates invitation.
- Body: `{ relink_user_id? }`
- Generates random token (32 bytes hex)
- Sets expires_at to 24h from now
- If `relink_user_id` provided, validates that user exists in same household
- Validates household has < 2 members for new user invitations
- Returns `{ token, url: \`\${appOrigin}/invite/\${token}\`, expires_at }`

**`GET /invite/:token`** — no auth. Validates and returns invitation info.
- Checks not expired, not used
- Returns `{ household_name, invited_by, is_relink, relink_username? }`

**`POST /invite/:token/claim`** — no auth. Claims invitation, registers passkey.
- Two-step: this endpoint receives the credential directly (the frontend calls start first to get options, then claim with the response)
- For new users: body `{ username, credential }` — creates app_user + legacy user + passkey
- For re-link: body `{ credential }` — links passkey to existing `relink_user_id`
- Marks invitation as used
- Creates session + cookie, returns `{ user }`

**`GET /invite/:token/register-options`** — no auth. Returns WebAuthn registration options for the invitation.
- For new users: creates temporary user context for registration options
- For re-link: uses existing user context

**Challenge storage:** Use a simple in-memory Map with 5-minute TTL. For a 2-user app this is sufficient — no need for Redis.

```typescript
const challenges = new Map<string, { challenge: string; expires: number }>();
const setChallenge = (key: string, challenge: string) => {
  challenges.set(key, { challenge, expires: Date.now() + 5 * 60 * 1000 });
};
const getAndDeleteChallenge = (key: string): string | null => {
  const entry = challenges.get(key);
  challenges.delete(key);
  if (!entry || entry.expires < Date.now()) return null;
  return entry.challenge;
};
```

- [ ] **Step 2: Mount in `server/index.ts`, remove old magic link routes**

Replace:
```typescript
import {
  authenticateToken, AuthRequest, verifyPin,
  sendMagicLink, confirmMagicLink, findOrCreateAppUserFromSupabase,
  createAppSession, setAppSessionCookie, clearAuthCookies, revokeAppSession,
} from './auth.js';
```
With:
```typescript
import {
  authenticateToken, AuthRequest, verifyPin,
  createAppSession, setAppSessionCookie, clearAuthCookies, revokeAppSession,
} from './auth.js';
import passkeyAuthRouter from './routes/passkey-auth.js';
```

Mount: `app.use('/api/auth', passkeyAuthRouter);`

Remove: all three magic link endpoint handlers (`magic-link/start`, `magic-link/confirm`, `session/exchange`) and their Zod schemas (`magicLinkSchema`, `sessionExchangeSchema`, `magicLinkConfirmSchema`).

Keep: verify-pin, update-pin, logout, me/session endpoints.

- [ ] **Step 3: Verify compiles**

```bash
npx tsc --noEmit -p server/tsconfig.json
```

- [ ] **Step 4: Commit**

---

### Task 4: Backend — Clean Up auth.ts (Remove Supabase)

**Files:**
- Modify: `server/auth.ts`

- [ ] **Step 1: Remove all Supabase functions and types**

Remove:
- All Supabase imports from config (`supabaseUrl`, `supabaseAnonKey`, `supabaseServiceRoleKey`, `magicLinkAllowedEmails`)
- Type definitions: `MagicLinkResult`, `SupabaseUserSyncResult`, `MagicLinkConfirmResult`
- Functions: `isMagicLinkEmailAllowed`, `parseSupabaseError`, `deriveUsernameFromEmail`, `findAvailableUsername`, `fetchSupabaseUser`, `findOrCreateAppUserFromSupabase`, `sendMagicLink`, `confirmMagicLink`
- Constants: `authErrorStatuses`, `rateLimitErrorCodes`, `normalizeEmail` (if only used by removed code)

Keep:
- `AuthUser`, `AuthRequest` interfaces
- `hashSessionToken`, `sessionCookieOptions`
- `createAppSession`, `setAppSessionCookie`, `clearAuthCookies`, `revokeAppSession`, `getAppUserFromSession`
- `verifyPin`
- `authenticateToken` middleware
- `ensureSessionColumns` import
- `appSessionDays`, `appSessionCookieName` imports from config

Import `appBaseUrl` only if still needed. Replace with `appOrigin` from config if the passkey router uses it.

- [ ] **Step 2: Verify compiles, commit**

---

### Task 5: Frontend — API Client & Auth Context

**Files:**
- Modify: `src/api.ts`
- Modify: `src/auth.tsx`

- [ ] **Step 1: Replace magic link API methods with passkey methods in `src/api.ts`**

Remove: `startMagicLink`, `exchangeSession`, `confirmMagicLink`.
Remove `/auth/session/exchange` from the 401 handler exclusion list.

Add:
```typescript
static async getSetupStatus(): Promise<{ hasUsers: boolean; needsPasskeyMigration: boolean }> {
  return this.request('/auth/setup-status');
}
static async setupStart(username: string) {
  return this.request('/auth/setup/start', { method: 'POST', body: { username } });
}
static async setupFinish(userId: number, credential: unknown) {
  return this.request('/auth/setup/finish', { method: 'POST', body: { userId, credential } });
}
static async registerStart() {
  return this.request('/auth/register/start', { method: 'POST' });
}
static async registerFinish(credential: unknown) {
  return this.request('/auth/register/finish', { method: 'POST', body: { credential } });
}
static async loginStart() {
  return this.request('/auth/login/start', { method: 'POST' });
}
static async loginFinish(credential: unknown) {
  return this.request('/auth/login/finish', { method: 'POST', body: { credential } });
}
static async createInvite(relinkUserId?: number) {
  return this.request('/auth/invite', { method: 'POST', body: { relink_user_id: relinkUserId } });
}
static async getInvite(token: string) {
  return this.request(`/auth/invite/${token}`);
}
static async getInviteRegisterOptions(token: string) {
  return this.request(`/auth/invite/${token}/register-options`);
}
static async claimInvite(token: string, data: { username?: string; credential: unknown }) {
  return this.request(`/auth/invite/${token}/claim`, { method: 'POST', body: data });
}
```

- [ ] **Step 2: Rewrite `src/auth.tsx` — replace magic link with passkey**

Replace `startMagicLink`, `confirmMagicLink`, `finishMagicLinkLogin` with:

```typescript
interface AuthContextType {
  user: User | null;
  isLoading: boolean;
  isLocked: boolean;
  loginWithPasskey: () => Promise<void>;
  registerPasskey: () => Promise<void>;
  logout: () => Promise<void>;
  verifyPin: (pin: string) => Promise<boolean>;
  isAuthenticated: boolean;
}
```

Implement `loginWithPasskey`:
```typescript
const loginWithPasskey = async () => {
  const { startAuthentication } = await import('@simplewebauthn/browser');
  setIsLoading(true);
  try {
    const options = await Api.loginStart();
    const credential = await startAuthentication(options);
    const response = await Api.loginFinish(credential);
    setUser(response.user);
  } finally {
    setIsLoading(false);
  }
};
```

Implement `registerPasskey`:
```typescript
const registerPasskey = async () => {
  const { startRegistration } = await import('@simplewebauthn/browser');
  const options = await Api.registerStart();
  const credential = await startRegistration(options);
  await Api.registerFinish(credential);
};
```

Keep `bootstrapSession`, `logout`, `verifyPin` unchanged.

- [ ] **Step 3: Verify build**

```bash
npx vite build
```

- [ ] **Step 4: Commit**

---

### Task 6: Frontend — Login, Setup, Invite Views

**Files:**
- Rewrite: `src/views/Login.tsx`
- Create: `src/views/Setup.tsx`
- Create: `src/views/Invite.tsx`
- Delete: `src/views/AuthCallback.tsx`
- Delete: `src/views/authConfirmAttempt.ts`
- Modify: `src/App.tsx`

- [ ] **Step 1: Rewrite `src/views/Login.tsx`**

On load, calls `Api.getSetupStatus()`:
- If `!hasUsers` → redirect to `/setup`
- If `needsPasskeyMigration` → show migration flow: PIN input → verify → register passkey
- Normal: "Iniciar sesión" button → calls `loginWithPasskey()` → redirect to dashboard
- Below button: "Usar PIN" link → shows PIN input → verify PIN → create session → redirect
- Keep the existing branding (left panel with mesh orbs, pills, etc.)

- [ ] **Step 2: Create `src/views/Setup.tsx`**

"Bienvenido a Nido" screen:
- Name input
- "Crear cuenta" button → calls `Api.setupStart(username)` → `startRegistration(options)` → `Api.setupFinish(userId, credential)` → redirect to `/`
- Same branding style as Login

- [ ] **Step 3: Create `src/views/Invite.tsx`**

Reads token from URL param `:token`.
- Calls `Api.getInvite(token)` on load
- Shows: "X te invitó a Nido"
- If error (expired/used): show error message
- If re-link: "Registrar nuevo dispositivo" button → registration flow
- If new user: name input + "Unirme" button → registration flow
- Registration: `Api.getInviteRegisterOptions(token)` → `startRegistration(options)` → `Api.claimInvite(token, { username?, credential })` → redirect to `/`

- [ ] **Step 4: Delete `src/views/AuthCallback.tsx` and `src/views/authConfirmAttempt.ts`**

- [ ] **Step 5: Update `src/App.tsx` routing**

Remove: `/auth/confirm` and `/auth/callback` routes
Add: `/setup` route (renders `Setup`, only when not authenticated)
Add: `/invite/:token` route (renders `Invite`, only when not authenticated)

Update the routing logic:
```typescript
if (location.pathname === '/setup') {
  return <Setup />;
}
if (location.pathname.startsWith('/invite/')) {
  return <Invite />;
}
if (!isAuthenticated) {
  return <Login />;
}
```

- [ ] **Step 6: Verify build**

```bash
npx vite build
```

- [ ] **Step 7: Commit**

---

### Task 7: Frontend — Settings Passkey Management

**Files:**
- Modify: `src/views/Settings.tsx`

- [ ] **Step 1: Add "Dispositivos y acceso" section**

After the existing settings content, add a section that:
- Calls `Api.getMe()` to get current user
- Calls a new API method `Api.getPasskeys()` (add to api.ts: `GET /auth/passkeys` — returns list of user's passkeys)
- Lists registered passkeys (device_name + formatted created_at)
- "Agregar dispositivo" button → calls `registerPasskey()` from auth context → reloads list
- "Invitar a tu pareja" button (if household < 2 members) → calls `Api.createInvite()` → shows copyable link
- "Re-vincular dispositivo de [partner]" button → calls `Api.createInvite(partnerId)` → shows copyable link

Add corresponding backend endpoint:
- `GET /auth/passkeys` (in passkey-auth.ts) — requires auth, returns user's passkey list

- [ ] **Step 2: Verify build, commit**

---

### Task 8: Cleanup & Verify

**Files:** Various

- [ ] **Step 1: Remove Supabase env vars from production .env**

```bash
ssh -i ~/.ssh/webserverkeypair.pem ubuntu@13.48.46.19 "cd /var/www/nido && sed -i '/^SUPABASE_/d; /^MAGIC_LINK_/d' .env && echo 'APP_ORIGIN=https://nido.sdar.dev' >> .env"
```

- [ ] **Step 2: Type-check server**

```bash
npx tsc --noEmit -p server/tsconfig.json
```

- [ ] **Step 3: Build frontend**

```bash
npx vite build
```

- [ ] **Step 4: Run all tests — fix broken ones**

```bash
npx vitest run
```

Fix auth tests: remove magic link tests, add passkey tests with mocked `@simplewebauthn/server`. Fix config tests: remove Supabase env var requirements.

- [ ] **Step 5: Test locally end-to-end**

Start the server locally, open browser:
1. Fresh DB → should show Setup screen
2. Register first user with passkey
3. Generate invitation, open in incognito → register second user
4. Logout → login with passkey
5. PIN fallback login

- [ ] **Step 6: Commit**

---

### Task 9: Deploy

- [ ] **Step 1: Create branch, PR, merge**
- [ ] **Step 2: `npm run deploy`**
- [ ] **Step 3: Verify production — migration screen should appear for Samuel/María to register passkeys via PIN**

# Passkey Auth — Remove Supabase Dependency

**Date:** 2026-04-09
**Status:** Approved
**Scope:** Replace Supabase magic link auth with WebAuthn passkeys, making Nido fully autonomous with zero external dependencies.

---

## Problem

Nido depends on Supabase for magic link authentication. Supabase is unreliable and prevents the app from being self-contained. Anyone deploying Nido must create a Supabase project, configure email providers, and manage external API keys. This blocks easy distribution.

## Design

### Auth Model

**Primary:** Passkeys (WebAuthn) — biometric or device-based authentication. No email, no passwords, no external services. The server stores public keys, the device holds private keys.

**Fallback:** PIN (already exists, bcrypt-hashed) — for cases where passkey is unavailable.

**Recovery:** Partner re-invitation — if a user loses all devices, their partner generates a re-link invitation from within the app.

### New Tables

**`passkey_credentials`** — WebAuthn credential storage.

```sql
passkey_credentials (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  app_user_id INTEGER NOT NULL REFERENCES app_users(id) ON DELETE CASCADE,
  credential_id TEXT NOT NULL UNIQUE,
  public_key TEXT NOT NULL,
  sign_count INTEGER NOT NULL DEFAULT 0,
  transports TEXT,
  device_name TEXT,
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP
)
```

- `credential_id` and `public_key` stored as base64url strings.
- `transports` stored as JSON array string (e.g. `["internal","hybrid"]`).
- `device_name` is user-agent derived label (e.g. "iPhone de Samuel").
- One user can have multiple credentials (multiple devices).

**`device_invitations`** — temporary tokens for onboarding and device recovery.

```sql
device_invitations (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  household_id INTEGER NOT NULL REFERENCES households(id) ON DELETE CASCADE,
  invited_by_user_id INTEGER NOT NULL REFERENCES app_users(id),
  token TEXT NOT NULL UNIQUE,
  expires_at DATETIME NOT NULL,
  relink_user_id INTEGER REFERENCES app_users(id),
  used_at DATETIME,
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP
)
```

- `token`: random 32-byte hex string.
- `expires_at`: 24 hours from creation.
- `relink_user_id`: if set, the invitation re-links a passkey to this existing user instead of creating a new one. Used for device recovery.
- `used_at`: set when claimed, prevents reuse.

### User Flows

**First-time setup (fresh install, no users):**
1. Open Nido → "Bienvenido a Nido" setup screen
2. Enter name → browser prompts passkey registration (biometric/PIN)
3. Server creates household, app_user, passkey_credential
4. Redirected to dashboard with "Invitar a tu pareja" prompt

**Invite partner:**
1. From Settings → "Invitar a tu pareja" → generates link with token (valid 24h)
2. Share link (copy/QR)
3. Partner opens link → sees "Samuel te invitó a Nido" → enters name → registers passkey
4. Server creates app_user in same household, saves credential

**Normal login:**
1. Open Nido → "Iniciar sesión" button → browser presents passkey prompt (biometric)
2. Server verifies assertion → creates app session (HttpOnly cookie)
3. Passkeys sync across devices in same ecosystem (iCloud Keychain, Google Password Manager)

**PIN fallback (passkey unavailable):**
1. Login screen shows "Usar PIN" link below passkey button
2. Enter PIN → server verifies with bcrypt → creates session
3. User prompted to register passkey for next time

**Device recovery (lost all devices):**
1. Partner goes to Settings → "Re-vincular dispositivo de [nombre]"
2. Generates re-link invitation (token bound to the lost user's app_user_id via `relink_user_id`)
3. User opens link on new device → registers passkey → credential linked to existing app_user
4. No new user created, retains all data and history

**Migration from Supabase (existing production users):**
1. Deploy new version → Samuel and María exist in app_users but have no passkeys
2. Nido detects users without passkeys → shows "Nido se actualizó" screen
3. User verifies identity with PIN (they already know it)
4. Registers passkey
5. Subsequent logins are biometric

### API Endpoints

**New endpoints:**

`GET /api/auth/setup-status`
- Returns: `{ hasUsers: boolean, needsPasskeyMigration: boolean }`
- `hasUsers = false`: show setup screen
- `needsPasskeyMigration = true`: show migration screen (users exist but no passkeys)

`POST /api/auth/setup/start`
- Body: `{ username }` — for first-time setup only (no users in system)
- Creates household and app_user. Returns WebAuthn registration options.
- Fails if any users already exist.

`POST /api/auth/setup/finish`
- Body: `{ credential }` — the browser's attestation response
- Verifies and stores passkey_credential for the user created in setup/start.
- Creates app session and sets cookie. Returns `{ user }`.

`POST /api/auth/register/start`
- Requires auth (session or PIN verification)
- Returns WebAuthn `PublicKeyCredentialCreationOptions` for the authenticated user

`POST /api/auth/register/finish`
- Requires auth
- Body: `{ credential }` — the browser's attestation response
- Verifies and stores passkey_credential. Returns `{ success: true }`

`POST /api/auth/login/start`
- No auth required
- Returns WebAuthn `PublicKeyCredentialRequestOptions` with allowed credentials

`POST /api/auth/login/finish`
- No auth required
- Body: `{ credential }` — the browser's assertion response
- Verifies signature, updates sign_count, creates app session, sets cookie
- Returns `{ user }`

`POST /api/auth/invite`
- Requires auth
- Body: `{ relink_user_id? }` — if set, creates re-link invitation for that user
- Creates device_invitation with 24h expiry
- Returns `{ token, url, expires_at }`

`GET /api/auth/invite/:token`
- No auth required
- Validates token (not expired, not used)
- Returns `{ household_name, invited_by, is_relink, relink_username? }`

`POST /api/auth/invite/:token/claim`
- No auth required
- Body: `{ username, credential }` — for new users
- Or: `{ credential }` — for re-link (username comes from existing user)
- Creates app_user (or links to existing), stores passkey_credential, creates session
- Marks invitation as used

**Endpoints removed:**
- `POST /api/auth/magic-link/start`
- `POST /api/auth/magic-link/confirm`
- `POST /api/auth/session/exchange`

**Endpoints unchanged:**
- `GET /api/auth/me` — session validation
- `POST /api/auth/logout` — session revocation
- `POST /api/auth/verify-pin` — PIN verification
- `POST /api/auth/update-pin` — PIN update
- `authenticateToken` middleware — HttpOnly cookie sessions

### Configuration Changes

**Removed:**
- `SUPABASE_URL` (required → gone)
- `SUPABASE_ANON_KEY` (required → gone)
- `SUPABASE_SERVICE_ROLE_KEY` (optional → gone)

**Added:**
- `APP_ORIGIN` — the app's origin URL, required for WebAuthn relying party ID. Example: `https://nido.sdar.dev`. In development: `http://localhost:3100`.

**Kept:**
- `APP_BASE_URL` — already exists, used for other things. `APP_ORIGIN` can derive from it.
- `APP_SESSION_DAYS`, `APP_SESSION_COOKIE_NAME` — session config unchanged
- `MAGIC_LINK_ALLOWED_EMAILS` → renamed to `ALLOWED_EMAILS` (optional, for restricting who can accept invitations)

### Dependencies

**Add:**
- `@simplewebauthn/server` — WebAuthn server-side verification
- `@simplewebauthn/browser` — WebAuthn browser-side API wrapper

**Remove:**
- No npm packages to remove (Supabase was used via raw fetch, not an SDK)

### Code Cleanup

**Remove from `server/auth.ts`:**
- `fetchSupabaseUser()` function
- `findOrCreateAppUserFromSupabase()` function
- `sendMagicLink()` function
- `confirmMagicLink()` function
- `parseSupabaseError()` function
- `isMagicLinkEmailAllowed()` function (repurpose for invitation allowlist if ALLOWED_EMAILS is set)
- All Supabase type definitions (`MagicLinkResult`, `SupabaseUserSyncResult`, `MagicLinkConfirmResult`)
- Supabase config imports (`supabaseUrl`, `supabaseAnonKey`, `supabaseServiceRoleKey`)

**Remove from `server/config.ts`:**
- Supabase env schema entries
- Supabase getter methods and exports
- `magicLinkAllowedEmails` → rename to `allowedEmails`

**Remove from `server/index.ts`:**
- Magic link endpoint handlers
- Session exchange endpoint handler
- Imports of removed auth functions

**Remove from frontend:**
- `src/views/AuthCallback.tsx` — delete file
- `src/views/authConfirmAttempt.ts` — delete file
- `startMagicLink`, `confirmMagicLink`, `finishMagicLinkLogin` from `auth.tsx`
- `Api.startMagicLink`, `Api.exchangeSession`, `Api.confirmMagicLink` from `api.ts`
- Route `/auth/confirm` from `App.tsx`

**Add to frontend:**
- `src/views/Setup.tsx` — first-time setup screen
- `src/views/Invite.tsx` — invitation claim screen (replaces AuthCallback)
- Route `/invite/:token` in `App.tsx`
- `loginWithPasskey()`, `registerPasskey()` in `auth.tsx`
- `Api.getSetupStatus()`, `Api.setup()`, `Api.registerStart/Finish()`, `Api.loginStart/Finish()`, `Api.createInvite()`, `Api.getInvite()`, `Api.claimInvite()` in `api.ts`

### Frontend Views

**Login.tsx** — rewritten:
- Checks `getSetupStatus()` on load
- If `hasUsers === false` → redirect to `/setup`
- If `needsPasskeyMigration` → show migration flow (verify PIN → register passkey)
- Normal state: button "Iniciar sesión" → WebAuthn prompt → session
- Below: "Usar PIN" link as fallback

**Setup.tsx** — new:
- "Bienvenido a Nido" screen
- Name input → "Crear cuenta" button → WebAuthn registration
- After success → redirect to dashboard

**Invite.tsx** — new (replaces AuthCallback):
- Reads `:token` from URL
- Calls `getInvite(token)` → shows household info and who invited
- If re-link: "Registrar nuevo dispositivo" → WebAuthn registration
- If new user: name input → "Unirme" → WebAuthn registration
- After success → redirect to dashboard

**Settings** — new section "Dispositivos y acceso":
- List of registered passkeys (device_name, created_at)
- "Agregar dispositivo" button (register additional passkey)
- "Invitar a tu pareja" button (if household has < 2 members)
- "Re-vincular dispositivo de [partner name]" button (generates re-link invitation)

### WebAuthn Configuration

```typescript
const rpName = 'Nido';
const rpID = new URL(APP_ORIGIN).hostname;  // e.g. 'nido.sdar.dev' or 'localhost'
const origin = APP_ORIGIN;  // e.g. 'https://nido.sdar.dev'
```

- `rpID` is the hostname (no port, no protocol) — this is what passkeys are bound to
- Attestation: `"none"` (we don't need hardware attestation)
- User verification: `"preferred"` (biometric if available, fall back to device PIN)
- Resident key: `"preferred"` (allows passwordless discovery, but doesn't require it)

### Error Handling

- **Passkey not supported:** show PIN fallback prominently, suggest using a modern browser
- **Invitation expired:** "Este enlace ha expirado. Pide a tu pareja que genere uno nuevo."
- **Invitation already used:** "Este enlace ya fue utilizado."
- **Household full (2 members):** "Este hogar ya tiene dos miembros."
- **WebAuthn ceremony cancelled:** return to login screen, no error toast
- **Sign count mismatch:** log warning (possible credential cloning), but don't block auth for a 2-person household app

### Testing Strategy

- **WebAuthn:** mock `@simplewebauthn/server` in tests. Test registration/verification flows with mock credentials.
- **Invitations:** test token generation, expiry, single-use, re-link vs new user paths.
- **Migration:** test the PIN → passkey migration flow.
- **Setup:** test fresh install flow (no users → first user → invite partner).

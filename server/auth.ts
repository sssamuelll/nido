import jwt, { VerifyErrors, JwtPayload } from 'jsonwebtoken';
import bcrypt from 'bcryptjs';
import { randomBytes, createHash } from 'crypto';
import { Request, Response, NextFunction } from 'express';
import { getDatabase, ensureSessionColumns } from './db.js';
import {
  jwtSecret,
  isSupabaseAuthConfigured,
  supabaseUrl,
  supabaseAnonKey,
  supabaseServiceRoleKey,
  magicLinkAllowedEmails,
  appBaseUrl,
  appSessionDays,
  appSessionCookieName,
} from './config.js';

export interface AuthUser {
  id: number;
  username: string;
  email?: string | null;
}

export interface AuthRequest extends Request {
  user?: AuthUser;
  // Populated by validation middleware with the Zod-parsed result.
  // Typed as Record<string, unknown>; route handlers narrow via assertion.
  validatedData?: Record<string, unknown>;
  validatedMonth?: string;
}

interface LegacyUserRow {
  id: number;
  username: string;
  password: string;
}

interface AppUserRow {
  id: number;
  username: string;
  email: string | null;
}

export type MagicLinkResult =
  | { success: true }
  | { success: false; reason: 'disabled' | 'forbidden' }
  | {
      success: false;
      reason: 'rate_limited' | 'auth' | 'upstream';
      status: number;
      error: string;
    };

export type SupabaseUserSyncResult =
  | { success: true; user: AuthUser }
  | { success: false; reason: 'disabled' | 'forbidden' }
  | {
      success: false;
      reason: 'auth' | 'upstream';
      status: number;
      error: string;
    };

export type MagicLinkConfirmResult =
  | { success: true; accessToken: string }
  | { success: false; reason: 'disabled' }
  | {
      success: false;
      reason: 'auth' | 'upstream';
      status: number;
      error: string;
    };

const hashSessionToken = (token: string) => createHash('sha256').update(token).digest('hex');
const normalizeEmail = (email: string) => email.trim().toLowerCase();

export const isMagicLinkEmailAllowed = (email: string) => {
  if (magicLinkAllowedEmails.length === 0) {
    return false;
  }

  return magicLinkAllowedEmails.includes(normalizeEmail(email));
};

const sessionCookieOptions = () => ({
  httpOnly: true,
  secure: process.env.NODE_ENV === 'production',
  sameSite: 'lax' as const,
  maxAge: appSessionDays * 24 * 60 * 60 * 1000,
  path: '/',
});

const deriveUsernameFromEmail = (email: string) => {
  const candidate = email
    .split('@')[0]
    .toLowerCase()
    .replace(/[^a-z0-9._-]/g, '-')
    .replace(/-+/g, '-')
    .replace(/^-|-$/g, '');

  return candidate || `user-${randomBytes(4).toString('hex')}`;
};

const authErrorStatuses = new Set([400, 401, 403, 422]);
const rateLimitErrorCodes = new Set([
  'over_email_send_rate_limit',
  'over_request_rate_limit',
  'over_sms_send_rate_limit',
]);

const parseSupabaseError = async (response: globalThis.Response) => {
  let payload: Record<string, unknown> | null = null;

  try {
    payload = await response.json() as Record<string, unknown>;
  } catch {
    payload = null;
  }

  const code = typeof payload?.code === 'string' ? payload.code : null;
  const message = typeof payload?.msg === 'string'
    ? payload.msg
    : typeof payload?.error_description === 'string'
      ? payload.error_description
      : typeof payload?.error === 'string'
        ? payload.error
        : typeof payload?.message === 'string'
          ? payload.message
          : response.statusText || 'Supabase request failed';

  if (response.status === 429 || (code && rateLimitErrorCodes.has(code))) {
    return {
      reason: 'rate_limited' as const,
      status: 429,
      error: 'Supabase rate limit reached. Please try again shortly.',
    };
  }

  if (authErrorStatuses.has(response.status)) {
    return {
      reason: 'auth' as const,
      status: response.status,
      error: message,
    };
  }

  return {
    reason: 'upstream' as const,
    status: 502,
    error: message,
  };
};

const findAvailableUsername = async (baseUsername: string) => {
  const db = getDatabase();
  let candidate = baseUsername;
  let suffix = 1;

  while (true) {
    const existing = await db.get<{ id: number }>('SELECT id FROM app_users WHERE username = ?', candidate);
    if (!existing) {
      return candidate;
    }

    candidate = `${baseUsername}-${suffix}`;
    suffix += 1;
  }
};

export const isMagicLinkEnabled = () => isSupabaseAuthConfigured;

// Login function
export const login = async (username: string, password: string): Promise<{ token: string; user: AuthUser } | null> => {
  try {
    const db = getDatabase();
    const user = await db.get<LegacyUserRow>('SELECT * FROM users WHERE username = ?', username);

    if (!user || !bcrypt.compareSync(password, user.password)) {
      return null;
    }

    const token = jwt.sign(
      { id: user.id, username: user.username },
      jwtSecret,
      { expiresIn: '365d' }
    );

    return {
      token,
      user: { id: user.id, username: user.username }
    };
  } catch (error) {
    console.error('Login error:', error);
    return null;
  }
};

export const createAppSession = async (appUserId: number, req: Request) => {
  const db = getDatabase();
  const sessionToken = randomBytes(32).toString('hex');
  const sessionId = randomBytes(16).toString('hex');
  const expiresAt = new Date(Date.now() + appSessionDays * 24 * 60 * 60 * 1000).toISOString();
  const userAgent = req.get('user-agent') ?? null;

  const insertSession = async () => db.run(
    `
      INSERT INTO sessions (id, app_user_id, token_hash, expires_at, user_agent)
      VALUES (?, ?, ?, ?, ?)
    `,
    sessionId,
    appUserId,
    hashSessionToken(sessionToken),
    expiresAt,
    userAgent
  );

  try {
    await insertSession();
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : '';
    if (!message.includes('table sessions has no column named user_agent')) {
      throw error;
    }

    await ensureSessionColumns(db);
    await insertSession();
  }

  return { sessionToken, expiresAt };
};

export const setAppSessionCookie = (res: Response, sessionToken: string) => {
  res.cookie(appSessionCookieName, sessionToken, sessionCookieOptions());
};

export const clearAuthCookies = (res: Response) => {
  res.clearCookie(appSessionCookieName, { path: '/' });
  res.clearCookie('token', { path: '/' });
};

export const revokeAppSession = async (sessionToken?: string | null) => {
  if (!sessionToken) return;
  const db = getDatabase();
  await db.run('DELETE FROM sessions WHERE token_hash = ?', hashSessionToken(sessionToken));
};

const getAppUserFromSession = async (sessionToken: string): Promise<AuthUser | null> => {
  const db = getDatabase();
  const session = await db.get<AppUserRow & { expires_at: string }>(
    `
      SELECT app_users.id, app_users.username, app_users.email, sessions.expires_at
      FROM sessions
      INNER JOIN app_users ON app_users.id = sessions.app_user_id
      WHERE sessions.token_hash = ?
    `,
    hashSessionToken(sessionToken)
  );

  if (!session) {
    return null;
  }

  if (new Date(session.expires_at).getTime() <= Date.now()) {
    await revokeAppSession(sessionToken);
    return null;
  }

  await db.run(
    `UPDATE sessions SET last_seen_at = CURRENT_TIMESTAMP WHERE token_hash = ?`,
    hashSessionToken(sessionToken)
  );

  return {
    id: session.id,
    username: session.username,
    email: session.email,
  };
};

const fetchSupabaseUser = async (accessToken: string): Promise<
  | { success: true; identity: { id: string; email?: string | null } }
  | { success: false; reason: 'disabled' | 'auth' | 'upstream'; status?: number; error?: string }
> => {
  if (!isSupabaseAuthConfigured || !supabaseUrl || !supabaseAnonKey) {
    return { success: false, reason: 'disabled' };
  }

  const response = await fetch(`${supabaseUrl}/auth/v1/user`, {
    headers: {
      Authorization: `Bearer ${accessToken}`,
      apikey: supabaseServiceRoleKey || supabaseAnonKey,
    },
  });

  if (!response.ok) {
    const parsed = await parseSupabaseError(response);
    return {
      success: false,
      reason: parsed.reason === 'rate_limited' ? 'upstream' : parsed.reason,
      status: parsed.reason === 'rate_limited' ? 502 : parsed.status,
      error: parsed.reason === 'rate_limited' ? 'Supabase user lookup was rate-limited' : parsed.error,
    };
  }

  return { success: true, identity: await response.json() };
};

export const findOrCreateAppUserFromSupabase = async (accessToken: string): Promise<SupabaseUserSyncResult> => {
  try {
    const identityResult = await fetchSupabaseUser(accessToken);
    if (!identityResult.success) {
      if (identityResult.reason === 'disabled') {
        return { success: false, reason: 'disabled' };
      }

      return {
        success: false,
        reason: identityResult.reason,
        status: identityResult.status ?? 502,
        error: identityResult.error ?? 'Supabase user lookup failed',
      };
    }

    const email = identityResult.identity.email ? normalizeEmail(identityResult.identity.email) : null;

    if (!identityResult.identity.id || !email || !isMagicLinkEmailAllowed(email)) {
      return { success: false, reason: 'forbidden' };
    }

    const db = getDatabase();
    const existingByEmail = await db.get<AppUserRow>('SELECT id, username, email FROM app_users WHERE lower(email) = lower(?)', email);
    if (existingByEmail) {
      return { success: true, user: existingByEmail };
    }

    const legacyByUsername = await db.get<AppUserRow>('SELECT id, username, email FROM app_users WHERE username = ?', deriveUsernameFromEmail(email));
    if (legacyByUsername && !legacyByUsername.email) {
      await db.run('UPDATE app_users SET email = ? WHERE id = ?', email, legacyByUsername.id);
      return { success: true, user: { ...legacyByUsername, email } };
    }

    const username = await findAvailableUsername(deriveUsernameFromEmail(email));
    const insertResult = await db.run(
      'INSERT INTO app_users (household_id, username, email) VALUES (?, ?, ?)',
      1,
      username,
      email
    );

    return {
      success: true,
      user: {
        id: insertResult.lastID!,
        username,
        email,
      },
    };
  } catch (error) {
    console.error('Supabase user sync error:', error);
    return {
      success: false,
      reason: 'upstream',
      status: 502,
      error: 'Supabase user sync failed',
    };
  }
};

export const sendMagicLink = async (email: string): Promise<MagicLinkResult> => {
  if (!isSupabaseAuthConfigured || !supabaseUrl || !supabaseAnonKey) {
    return { success: false as const, reason: 'disabled' as const };
  }

  if (!isMagicLinkEmailAllowed(email)) {
    return { success: false as const, reason: 'forbidden' as const };
  }

  const redirectTo = new URL('/auth/confirm', appBaseUrl).toString();
  const response = await fetch(`${supabaseUrl}/auth/v1/otp`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      apikey: supabaseAnonKey,
      Authorization: `Bearer ${supabaseAnonKey}`,
    },
    body: JSON.stringify({
      email: normalizeEmail(email),
      email_redirect_to: redirectTo,
    }),
  });

  if (!response.ok) {
    const parsed = await parseSupabaseError(response);
    console.error('Magic link send failed:', parsed.error);
    return { success: false, ...parsed };
  }

  return { success: true };
};

export const confirmMagicLink = async (tokenHash: string, type: string): Promise<MagicLinkConfirmResult> => {
  if (!isSupabaseAuthConfigured || !supabaseUrl || !supabaseAnonKey) {
    return { success: false, reason: 'disabled' };
  }

  const response = await fetch(`${supabaseUrl}/auth/v1/verify`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      apikey: supabaseAnonKey,
      Authorization: `Bearer ${supabaseAnonKey}`,
    },
    body: JSON.stringify({
      token_hash: tokenHash,
      type,
    }),
  });

  if (!response.ok) {
    const parsed = await parseSupabaseError(response);
    console.error('Magic link confirm failed:', parsed.error);
    return { success: false, reason: parsed.reason === 'rate_limited' ? 'upstream' : parsed.reason, status: parsed.reason === 'rate_limited' ? 502 : parsed.status, error: parsed.reason === 'rate_limited' ? 'Supabase magic link verification was rate-limited' : parsed.error };
  }

  const payload = await response.json().catch(() => null);
  const accessToken = typeof payload?.access_token === 'string' ? payload.access_token : null;

  if (!accessToken) {
    return {
      success: false,
      reason: 'upstream',
      status: 502,
      error: 'Supabase verification response did not include an access token',
    };
  }

  return { success: true, accessToken };
};

// Verify PIN function
export const verifyPin = async (username: string, pin: string): Promise<boolean> => {
  try {
    const db = getDatabase();
    const user = await db.get<{ pin: string }>('SELECT pin FROM users WHERE username = ?', username);
    if (!user) return false;
    // Support both hashed and legacy plaintext PINs
    if (user.pin.startsWith('$2a$') || user.pin.startsWith('$2b$')) {
      return bcrypt.compare(pin, user.pin);
    }
    return user.pin === pin;
  } catch (error) {
    console.error('PIN verify error:', error);
    return false;
  }
};

// Auth middleware
export const authenticateToken = (req: AuthRequest, res: Response, next: NextFunction) => {
  const sessionToken = req.cookies?.[appSessionCookieName];

  if (sessionToken) {
    void getAppUserFromSession(sessionToken)
      .then((user) => {
        if (user) {
          req.user = user;
          next();
          return;
        }

        const cookieToken = req.cookies?.token;
        const authHeader = req.headers.authorization;
        const bearerToken = authHeader?.startsWith('Bearer ') ? authHeader.slice(7) : null;
        const token = cookieToken || bearerToken;

        if (!token) {
          res.status(401).json({ error: 'Unauthorized' });
          return;
        }

        jwt.verify(token, jwtSecret, (err: VerifyErrors | null, decoded: JwtPayload | string | undefined) => {
          if (err) {
            res.status(401).json({ error: 'Session expired' });
            return;
          }

          req.user = decoded as AuthUser;
          next();
        });
      })
      .catch((error) => {
        console.error('Session auth error:', error);
        res.status(401).json({ error: 'Unauthorized' });
      });
    return;
  }

  const cookieToken = req.cookies?.token;
  const authHeader = req.headers.authorization;
  const bearerToken = authHeader?.startsWith('Bearer ') ? authHeader.slice(7) : null;
  const token = cookieToken || bearerToken;

  if (!token) {
    return res.status(401).json({ error: 'Unauthorized' });
  }

  jwt.verify(token, jwtSecret, (err: VerifyErrors | null, decoded: JwtPayload | string | undefined) => {
    if (err) {
      return res.status(401).json({ error: 'Session expired' });
    }

    req.user = decoded as AuthUser;
    next();
  });
};

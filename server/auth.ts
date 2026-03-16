import jwt from 'jsonwebtoken';
import bcrypt from 'bcryptjs';
import { randomBytes, createHash } from 'crypto';
import { Request, Response, NextFunction } from 'express';
import { getDatabase } from './db.js';
import {
  jwtSecret,
  isSupabaseAuthConfigured,
  supabaseUrl,
  supabaseAnonKey,
  supabaseServiceRoleKey,
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
  validatedData?: any;
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

const hashSessionToken = (token: string) => createHash('sha256').update(token).digest('hex');

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

  await db.run(
    `
      INSERT INTO sessions (id, app_user_id, token_hash, expires_at, user_agent)
      VALUES (?, ?, ?, ?, ?)
    `,
    sessionId,
    appUserId,
    hashSessionToken(sessionToken),
    expiresAt,
    req.get('user-agent') ?? null
  );

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

const fetchSupabaseUser = async (accessToken: string): Promise<{ id: string; email?: string | null } | null> => {
  if (!isSupabaseAuthConfigured || !supabaseUrl || !supabaseAnonKey) {
    return null;
  }

  const response = await fetch(`${supabaseUrl}/auth/v1/user`, {
    headers: {
      Authorization: `Bearer ${accessToken}`,
      apikey: supabaseServiceRoleKey || supabaseAnonKey,
    },
  });

  if (!response.ok) {
    return null;
  }

  return response.json();
};

export const findOrCreateAppUserFromSupabase = async (accessToken: string): Promise<AuthUser | null> => {
  try {
    const identity = await fetchSupabaseUser(accessToken);
    const email = identity?.email?.trim().toLowerCase();

    if (!identity?.id || !email) {
      return null;
    }

    const db = getDatabase();
    const existingByEmail = await db.get<AppUserRow>('SELECT id, username, email FROM app_users WHERE lower(email) = lower(?)', email);
    if (existingByEmail) {
      return existingByEmail;
    }

    const legacyByUsername = await db.get<AppUserRow>('SELECT id, username, email FROM app_users WHERE username = ?', deriveUsernameFromEmail(email));
    if (legacyByUsername && !legacyByUsername.email) {
      await db.run('UPDATE app_users SET email = ? WHERE id = ?', email, legacyByUsername.id);
      return { ...legacyByUsername, email };
    }

    const username = await findAvailableUsername(deriveUsernameFromEmail(email));
    const insertResult = await db.run(
      'INSERT INTO app_users (household_id, username, email) VALUES (?, ?, ?)',
      1,
      username,
      email
    );

    return {
      id: insertResult.lastID!,
      username,
      email,
    };
  } catch (error) {
    console.error('Supabase user sync error:', error);
    return null;
  }
};

export const sendMagicLink = async (email: string) => {
  if (!isSupabaseAuthConfigured || !supabaseUrl || !supabaseAnonKey) {
    return { success: false as const, reason: 'disabled' as const };
  }

  const redirectTo = new URL('/auth/callback', appBaseUrl).toString();
  const response = await fetch(`${supabaseUrl}/auth/v1/otp`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      apikey: supabaseAnonKey,
    },
    body: JSON.stringify({
      email,
      create_user: false,
      options: {
        emailRedirectTo: redirectTo,
      },
    }),
  });

  if (!response.ok) {
    const body = await response.text().catch(() => '');
    console.error('Magic link send failed:', body || response.statusText);
    return { success: false as const, reason: 'upstream' as const };
  }

  return { success: true as const };
};

// Verify PIN function
export const verifyPin = async (username: string, pin: string): Promise<boolean> => {
  try {
    const db = getDatabase();
    const user = await db.get<{ pin: string }>('SELECT pin FROM users WHERE username = ?', username);
    return !!user && user.pin === pin;
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

        jwt.verify(token, jwtSecret, (err: any, decoded: any) => {
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

  jwt.verify(token, jwtSecret, (err: any, decoded: any) => {
    if (err) {
      return res.status(401).json({ error: 'Session expired' });
    }

    req.user = decoded as AuthUser;
    next();
  });
};

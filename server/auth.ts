import bcrypt from 'bcryptjs';
import { randomBytes, createHash } from 'crypto';
import { Request, Response, NextFunction } from 'express';
import { getDatabase, ensureSessionColumns } from './db.js';
import {
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

// Auth middleware — app sessions only
export const authenticateToken = async (req: AuthRequest, res: Response, next: NextFunction) => {
  try {
    const sessionToken = req.cookies?.[appSessionCookieName];
    if (sessionToken) {
      const user = await getAppUserFromSession(sessionToken);
      if (user) {
        req.user = user;
        return next();
      }
    }

    res.status(401).json({ error: 'Unauthorized' });
  } catch (error) {
    console.error('Auth middleware error:', error);
    res.status(401).json({ error: 'Unauthorized' });
  }
};

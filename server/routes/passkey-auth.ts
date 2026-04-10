import { Router, Request, Response } from 'express';
import rateLimit from 'express-rate-limit';
import bcrypt from 'bcryptjs';
import { randomBytes } from 'crypto';
import {
  generateRegistrationOptions,
  verifyRegistrationResponse,
  generateAuthenticationOptions,
  verifyAuthenticationResponse,
} from '@simplewebauthn/server';
import type { AuthenticatorTransportFuture } from '@simplewebauthn/server';
import { getDatabase } from '../db.js';
import { appOrigin } from '../config.js';
import {
  authenticateToken,
  AuthRequest,
  createAppSession,
  setAppSessionCookie,
  verifyPin,
} from '../auth.js';

// ---------------------------------------------------------------------------
// WebAuthn relying-party config
// ---------------------------------------------------------------------------
const rpName = 'Nido';
const rpID = new URL(appOrigin).hostname;
const origin = appOrigin;

// ---------------------------------------------------------------------------
// In-memory challenge store (5-minute TTL, single-process only)
// ---------------------------------------------------------------------------
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

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------
const deriveDeviceName = (ua?: string): string => {
  if (!ua) return 'Unknown device';
  if (/iPhone|iPad/.test(ua)) return 'iOS device';
  if (/Android/.test(ua)) return 'Android device';
  if (/Macintosh/.test(ua)) return 'Mac';
  if (/Windows/.test(ua)) return 'Windows PC';
  if (/Linux/.test(ua)) return 'Linux device';
  return 'Unknown device';
};

// ---------------------------------------------------------------------------
// Rate limiter for login/setup endpoints
// ---------------------------------------------------------------------------
const loginLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 10,
  message: { error: 'Too many login attempts, please try again after 15 minutes' },
  standardHeaders: true,
  legacyHeaders: false,
});

// ---------------------------------------------------------------------------
// Router
// ---------------------------------------------------------------------------
const router = Router();

// ===== GET /setup-status =====
router.get('/setup-status', async (_req: Request, res: Response) => {
  try {
    const db = getDatabase();
    const userCount = await db.get<{ cnt: number }>('SELECT COUNT(*) as cnt FROM app_users');
    const hasUsers = (userCount?.cnt ?? 0) > 0;

    let needsPasskeyMigration = false;
    if (hasUsers) {
      const credCount = await db.get<{ cnt: number }>('SELECT COUNT(*) as cnt FROM passkey_credentials');
      needsPasskeyMigration = (credCount?.cnt ?? 0) === 0;
    }

    res.json({ hasUsers, needsPasskeyMigration });
  } catch (error) {
    console.error('Setup status error:', error);
    res.status(500).json({ error: 'Failed to check setup status' });
  }
});

// ===== POST /setup/start =====
router.post('/setup/start', loginLimiter, async (req: Request, res: Response) => {
  try {
    const { username } = req.body;
    if (!username || typeof username !== 'string' || username.trim().length === 0) {
      return res.status(400).json({ error: 'Username is required' });
    }

    const db = getDatabase();
    const userCount = await db.get<{ cnt: number }>('SELECT COUNT(*) as cnt FROM app_users');
    if ((userCount?.cnt ?? 0) > 0) {
      return res.status(400).json({ error: 'Setup already completed' });
    }

    // Create household
    const householdResult = await db.run(
      `INSERT INTO households (slug, name) VALUES ('primary', 'Mi hogar')`
    );
    const householdId = householdResult.lastID!;

    // Create legacy user (for PIN compatibility)
    const placeholderPassword = bcrypt.hashSync(randomBytes(16).toString('hex'), 10);
    const hashedPin = bcrypt.hashSync('1234', 10);
    const legacyResult = await db.run(
      'INSERT INTO users (username, password, pin) VALUES (?, ?, ?)',
      username.trim(),
      placeholderPassword,
      hashedPin
    );
    const legacyUserId = legacyResult.lastID!;

    // Create app_user
    const appUserResult = await db.run(
      'INSERT INTO app_users (household_id, legacy_user_id, username) VALUES (?, ?, ?)',
      householdId,
      legacyUserId,
      username.trim()
    );
    const appUserId = appUserResult.lastID!;

    // Generate registration options
    const options = await generateRegistrationOptions({
      rpName,
      rpID,
      userName: username.trim(),
      userID: new TextEncoder().encode(String(appUserId)),
      attestationType: 'none',
      authenticatorSelection: {
        residentKey: 'preferred',
        userVerification: 'preferred',
      },
    });

    setChallenge(`setup:${appUserId}`, options.challenge);

    res.json({ options, userId: appUserId });
  } catch (error) {
    console.error('Setup start error:', error);
    res.status(500).json({ error: 'Setup failed' });
  }
});

// ===== POST /setup/finish =====
router.post('/setup/finish', async (req: Request, res: Response) => {
  try {
    const { userId, credential } = req.body;
    if (!userId || !credential) {
      return res.status(400).json({ error: 'Missing userId or credential' });
    }

    const challenge = getAndDeleteChallenge(`setup:${userId}`);
    if (!challenge) {
      return res.status(400).json({ error: 'Challenge expired or invalid' });
    }

    const verification = await verifyRegistrationResponse({
      response: credential,
      expectedChallenge: challenge,
      expectedOrigin: origin,
      expectedRPID: rpID,
    });

    if (!verification.verified || !verification.registrationInfo) {
      return res.status(400).json({ error: 'Registration failed' });
    }

    const { registrationInfo } = verification;
    const credentialId = registrationInfo.credential.id;
    const publicKey = Buffer.from(registrationInfo.credential.publicKey).toString('base64url');
    const signCount = registrationInfo.credential.counter;
    const transports = JSON.stringify(credential.response?.transports ?? []);
    const deviceName = deriveDeviceName(req.get('user-agent'));

    const db = getDatabase();
    await db.run(
      `INSERT INTO passkey_credentials (app_user_id, credential_id, public_key, sign_count, transports, device_name)
       VALUES (?, ?, ?, ?, ?, ?)`,
      userId,
      credentialId,
      publicKey,
      signCount,
      transports,
      deviceName
    );

    const { sessionToken } = await createAppSession(userId, req);
    setAppSessionCookie(res, sessionToken);

    const user = await db.get<{ id: number; username: string }>(
      'SELECT id, username FROM app_users WHERE id = ?',
      userId
    );

    res.json({ user: { id: user!.id, username: user!.username } });
  } catch (error) {
    console.error('Setup finish error:', error);
    res.status(500).json({ error: 'Registration verification failed' });
  }
});

// ===== POST /register/start — add passkey to current user =====
router.post('/register/start', authenticateToken, async (req: AuthRequest, res: Response) => {
  try {
    const userId = req.user!.id;
    const username = req.user!.username;

    const db = getDatabase();
    const existingCreds = await db.all<{ credential_id: string; transports: string }[]>(
      'SELECT credential_id, transports FROM passkey_credentials WHERE app_user_id = ?',
      userId
    );

    const options = await generateRegistrationOptions({
      rpName,
      rpID,
      userName: username,
      userID: new TextEncoder().encode(String(userId)),
      attestationType: 'none',
      authenticatorSelection: {
        residentKey: 'preferred',
        userVerification: 'preferred',
      },
      excludeCredentials: existingCreds.map((c) => ({
        id: c.credential_id,
        transports: JSON.parse(c.transports || '[]') as AuthenticatorTransportFuture[],
      })),
    });

    setChallenge(`register:${userId}`, options.challenge);

    res.json(options);
  } catch (error) {
    console.error('Register start error:', error);
    res.status(500).json({ error: 'Failed to start registration' });
  }
});

// ===== POST /register/finish =====
router.post('/register/finish', authenticateToken, async (req: AuthRequest, res: Response) => {
  try {
    const userId = req.user!.id;
    const { credential } = req.body;
    if (!credential) {
      return res.status(400).json({ error: 'Missing credential' });
    }

    const challenge = getAndDeleteChallenge(`register:${userId}`);
    if (!challenge) {
      return res.status(400).json({ error: 'Challenge expired or invalid' });
    }

    const verification = await verifyRegistrationResponse({
      response: credential,
      expectedChallenge: challenge,
      expectedOrigin: origin,
      expectedRPID: rpID,
    });

    if (!verification.verified || !verification.registrationInfo) {
      return res.status(400).json({ error: 'Registration failed' });
    }

    const { registrationInfo } = verification;
    const credentialId = registrationInfo.credential.id;
    const publicKey = Buffer.from(registrationInfo.credential.publicKey).toString('base64url');
    const signCount = registrationInfo.credential.counter;
    const transports = JSON.stringify(credential.response?.transports ?? []);
    const deviceName = deriveDeviceName(req.get('user-agent'));

    const db = getDatabase();
    await db.run(
      `INSERT INTO passkey_credentials (app_user_id, credential_id, public_key, sign_count, transports, device_name)
       VALUES (?, ?, ?, ?, ?, ?)`,
      userId,
      credentialId,
      publicKey,
      signCount,
      transports,
      deviceName
    );

    res.json({ success: true });
  } catch (error) {
    console.error('Register finish error:', error);
    res.status(500).json({ error: 'Registration verification failed' });
  }
});

// ===== POST /login/start =====
router.post('/login/start', loginLimiter, async (_req: Request, res: Response) => {
  try {
    const db = getDatabase();
    const credentials = await db.all<{ credential_id: string; transports: string }[]>(
      'SELECT credential_id, transports FROM passkey_credentials'
    );

    const options = await generateAuthenticationOptions({
      rpID,
      allowCredentials: credentials.map((c) => ({
        id: c.credential_id,
        transports: JSON.parse(c.transports || '[]') as AuthenticatorTransportFuture[],
      })),
      userVerification: 'preferred',
    });

    setChallenge('login', options.challenge);

    res.json(options);
  } catch (error) {
    console.error('Login start error:', error);
    res.status(500).json({ error: 'Failed to start authentication' });
  }
});

// ===== POST /login/finish =====
router.post('/login/finish', async (req: Request, res: Response) => {
  try {
    const { credential } = req.body;
    if (!credential) {
      return res.status(400).json({ error: 'Missing credential' });
    }

    // credential.id is already base64url from the browser
    const credentialId = credential.id as string;

    const db = getDatabase();
    const dbCred = await db.get<{
      id: number;
      app_user_id: number;
      credential_id: string;
      public_key: string;
      sign_count: number;
    }>('SELECT * FROM passkey_credentials WHERE credential_id = ?', credentialId);

    if (!dbCred) {
      return res.status(400).json({ error: 'Credential not found' });
    }

    const challenge = getAndDeleteChallenge('login');
    if (!challenge) {
      return res.status(400).json({ error: 'Challenge expired or invalid' });
    }

    const verification = await verifyAuthenticationResponse({
      response: credential,
      expectedChallenge: challenge,
      expectedOrigin: origin,
      expectedRPID: rpID,
      credential: {
        id: dbCred.credential_id,
        publicKey: Buffer.from(dbCred.public_key, 'base64url'),
        counter: dbCred.sign_count,
      },
    });

    if (!verification.verified) {
      return res.status(400).json({ error: 'Authentication failed' });
    }

    // Update sign count
    await db.run(
      'UPDATE passkey_credentials SET sign_count = ? WHERE id = ?',
      verification.authenticationInfo.newCounter,
      dbCred.id
    );

    const user = await db.get<{ id: number; username: string }>(
      'SELECT id, username FROM app_users WHERE id = ?',
      dbCred.app_user_id
    );

    if (!user) {
      return res.status(400).json({ error: 'User not found' });
    }

    const { sessionToken } = await createAppSession(user.id, req);
    setAppSessionCookie(res, sessionToken);

    res.json({ user: { id: user.id, username: user.username } });
  } catch (error) {
    console.error('Login finish error:', error);
    res.status(500).json({ error: 'Authentication verification failed' });
  }
});

// ===== POST /invite — create invitation =====
router.post('/invite', authenticateToken, async (req: AuthRequest, res: Response) => {
  try {
    const userId = req.user!.id;
    const { relink_user_id } = req.body;

    const db = getDatabase();
    const appUser = await db.get<{ household_id: number }>(
      'SELECT household_id FROM app_users WHERE id = ?',
      userId
    );
    if (!appUser) {
      return res.status(404).json({ error: 'User not found' });
    }

    if (!relink_user_id) {
      // Check household has < 2 members
      const memberCount = await db.get<{ cnt: number }>(
        'SELECT COUNT(*) as cnt FROM app_users WHERE household_id = ?',
        appUser.household_id
      );
      if ((memberCount?.cnt ?? 0) >= 2) {
        return res.status(400).json({ error: 'Household already has maximum members' });
      }
    } else {
      // Validate relink user exists in same household
      const relinkUser = await db.get<{ id: number }>(
        'SELECT id FROM app_users WHERE id = ? AND household_id = ?',
        relink_user_id,
        appUser.household_id
      );
      if (!relinkUser) {
        return res.status(400).json({ error: 'Relink user not found in household' });
      }
    }

    const token = randomBytes(32).toString('hex');
    const expiresAt = new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString();

    await db.run(
      `INSERT INTO device_invitations (household_id, invited_by_user_id, token, expires_at, relink_user_id)
       VALUES (?, ?, ?, ?, ?)`,
      appUser.household_id,
      userId,
      token,
      expiresAt,
      relink_user_id ?? null
    );

    res.json({
      token,
      url: `${appOrigin}/invite/${token}`,
      expires_at: expiresAt,
    });
  } catch (error) {
    console.error('Invite create error:', error);
    res.status(500).json({ error: 'Failed to create invitation' });
  }
});

// ===== GET /invite/:token =====
router.get('/invite/:token', async (req: Request, res: Response) => {
  try {
    const db = getDatabase();
    const invitation = await db.get<{
      id: number;
      household_id: number;
      invited_by_user_id: number;
      expires_at: string;
      relink_user_id: number | null;
      used_at: string | null;
    }>(
      'SELECT * FROM device_invitations WHERE token = ? AND used_at IS NULL',
      req.params.token
    );

    if (!invitation) {
      return res.status(404).json({ error: 'Invitation not found or already used' });
    }

    if (new Date(invitation.expires_at).getTime() < Date.now()) {
      return res.status(410).json({ error: 'Invitation has expired' });
    }

    const household = await db.get<{ name: string }>(
      'SELECT name FROM households WHERE id = ?',
      invitation.household_id
    );

    const inviter = await db.get<{ username: string }>(
      'SELECT username FROM app_users WHERE id = ?',
      invitation.invited_by_user_id
    );

    const result: Record<string, unknown> = {
      household_name: household?.name ?? 'Unknown',
      invited_by: inviter?.username ?? 'Unknown',
      is_relink: !!invitation.relink_user_id,
    };

    if (invitation.relink_user_id) {
      const relinkUser = await db.get<{ username: string }>(
        'SELECT username FROM app_users WHERE id = ?',
        invitation.relink_user_id
      );
      result.relink_username = relinkUser?.username;
    }

    res.json(result);
  } catch (error) {
    console.error('Invite info error:', error);
    res.status(500).json({ error: 'Failed to get invitation info' });
  }
});

// ===== GET /invite/:token/register-options =====
router.get('/invite/:token/register-options', async (req: Request, res: Response) => {
  try {
    const db = getDatabase();
    const invitation = await db.get<{
      id: number;
      household_id: number;
      relink_user_id: number | null;
      expires_at: string;
      used_at: string | null;
    }>(
      'SELECT * FROM device_invitations WHERE token = ? AND used_at IS NULL',
      req.params.token
    );

    if (!invitation) {
      return res.status(404).json({ error: 'Invitation not found or already used' });
    }

    if (new Date(invitation.expires_at).getTime() < Date.now()) {
      return res.status(410).json({ error: 'Invitation has expired' });
    }

    let userName: string;
    let userID: Uint8Array;

    if (invitation.relink_user_id) {
      const existingUser = await db.get<{ id: number; username: string }>(
        'SELECT id, username FROM app_users WHERE id = ?',
        invitation.relink_user_id
      );
      if (!existingUser) {
        return res.status(400).json({ error: 'Relink user not found' });
      }
      userName = existingUser.username;
      userID = new TextEncoder().encode(String(existingUser.id));
    } else {
      // For new users, use a temporary identifier based on the token
      userName = `new-user-${req.params.token.slice(0, 8)}`;
      userID = new TextEncoder().encode(`invite:${req.params.token}`);
    }

    const options = await generateRegistrationOptions({
      rpName,
      rpID,
      userName,
      userID,
      attestationType: 'none',
      authenticatorSelection: {
        residentKey: 'preferred',
        userVerification: 'preferred',
      },
    });

    setChallenge(`invite:${req.params.token}`, options.challenge);

    res.json(options);
  } catch (error) {
    console.error('Invite register options error:', error);
    res.status(500).json({ error: 'Failed to generate registration options' });
  }
});

// ===== POST /invite/:token/claim =====
router.post('/invite/:token/claim', async (req: Request, res: Response) => {
  try {
    const { username, credential } = req.body;
    if (!credential) {
      return res.status(400).json({ error: 'Missing credential' });
    }

    const db = getDatabase();
    const invitation = await db.get<{
      id: number;
      household_id: number;
      relink_user_id: number | null;
      expires_at: string;
      used_at: string | null;
    }>(
      'SELECT * FROM device_invitations WHERE token = ? AND used_at IS NULL',
      req.params.token
    );

    if (!invitation) {
      return res.status(404).json({ error: 'Invitation not found or already used' });
    }

    if (new Date(invitation.expires_at).getTime() < Date.now()) {
      return res.status(410).json({ error: 'Invitation has expired' });
    }

    const challenge = getAndDeleteChallenge(`invite:${req.params.token}`);
    if (!challenge) {
      return res.status(400).json({ error: 'Challenge expired or invalid' });
    }

    const verification = await verifyRegistrationResponse({
      response: credential,
      expectedChallenge: challenge,
      expectedOrigin: origin,
      expectedRPID: rpID,
    });

    if (!verification.verified || !verification.registrationInfo) {
      return res.status(400).json({ error: 'Registration failed' });
    }

    const { registrationInfo } = verification;
    const credentialId = registrationInfo.credential.id;
    const publicKey = Buffer.from(registrationInfo.credential.publicKey).toString('base64url');
    const signCount = registrationInfo.credential.counter;
    const transports = JSON.stringify(credential.response?.transports ?? []);
    const deviceName = deriveDeviceName(req.get('user-agent'));

    let appUserId: number;

    if (invitation.relink_user_id) {
      // Relink: attach credential to existing user
      appUserId = invitation.relink_user_id;
    } else {
      // New user: create legacy user + app_user
      if (!username || typeof username !== 'string' || username.trim().length === 0) {
        return res.status(400).json({ error: 'Username is required for new users' });
      }

      const placeholderPassword = bcrypt.hashSync(randomBytes(16).toString('hex'), 10);
      const hashedPin = bcrypt.hashSync('1234', 10);
      const legacyResult = await db.run(
        'INSERT INTO users (username, password, pin) VALUES (?, ?, ?)',
        username.trim(),
        placeholderPassword,
        hashedPin
      );
      const legacyUserId = legacyResult.lastID!;

      const appUserResult = await db.run(
        'INSERT INTO app_users (household_id, legacy_user_id, username) VALUES (?, ?, ?)',
        invitation.household_id,
        legacyUserId,
        username.trim()
      );
      appUserId = appUserResult.lastID!;
    }

    // Store credential
    await db.run(
      `INSERT INTO passkey_credentials (app_user_id, credential_id, public_key, sign_count, transports, device_name)
       VALUES (?, ?, ?, ?, ?, ?)`,
      appUserId,
      credentialId,
      publicKey,
      signCount,
      transports,
      deviceName
    );

    // Mark invitation as used
    await db.run(
      'UPDATE device_invitations SET used_at = CURRENT_TIMESTAMP WHERE id = ?',
      invitation.id
    );

    // Create session
    const { sessionToken } = await createAppSession(appUserId, req);
    setAppSessionCookie(res, sessionToken);

    const user = await db.get<{ id: number; username: string }>(
      'SELECT id, username FROM app_users WHERE id = ?',
      appUserId
    );

    res.json({ user: { id: user!.id, username: user!.username } });
  } catch (error) {
    console.error('Invite claim error:', error);
    res.status(500).json({ error: 'Failed to claim invitation' });
  }
});

// ===== GET /passkeys — list user's passkeys =====
router.get('/passkeys', authenticateToken, async (req: AuthRequest, res: Response) => {
  try {
    const db = getDatabase();
    const passkeys = await db.all<{ id: number; device_name: string; created_at: string }[]>(
      'SELECT id, device_name, created_at FROM passkey_credentials WHERE app_user_id = ?',
      req.user!.id
    );

    res.json(passkeys);
  } catch (error) {
    console.error('Passkeys list error:', error);
    res.status(500).json({ error: 'Failed to fetch passkeys' });
  }
});

// ===== POST /pin-login — PIN-based login (migration / fallback) =====
router.post('/pin-login', loginLimiter, async (req: Request, res: Response) => {
  try {
    const { username, pin } = req.body;
    if (!username || !pin) {
      return res.status(400).json({ error: 'Username and PIN required' });
    }

    const isValid = await verifyPin(username, pin);
    if (!isValid) {
      return res.status(401).json({ error: 'PIN incorrecto' });
    }

    const db = getDatabase();
    const user = await db.get<{ id: number; username: string }>(
      'SELECT id, username FROM app_users WHERE username = ?',
      username
    );
    if (!user) {
      return res.status(404).json({ error: 'User not found' });
    }

    const { sessionToken } = await createAppSession(user.id, req);
    setAppSessionCookie(res, sessionToken);

    res.json({ user: { id: user.id, username: user.username } });
  } catch (error) {
    console.error('PIN login error:', error);
    res.status(500).json({ error: 'Login failed' });
  }
});

export default router;

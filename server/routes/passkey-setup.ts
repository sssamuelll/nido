import { Router, Request, Response } from 'express';
import bcrypt from 'bcryptjs';
import {
  generateRegistrationOptions,
  verifyRegistrationResponse,
} from '@simplewebauthn/server';
import { getDatabase } from '../db.js';
import { createAppSession, setAppSessionCookie } from '../auth.js';
import {
  rpName,
  rpID,
  origin,
  setChallenge,
  getAndDeleteChallenge,
  loginLimiter,
  deriveDeviceName,
} from './passkey-auth.js';

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
    res.status(500).json({ error: 'Error al verificar estado de configuración' });
  }
});

// ===== POST /setup/start =====
router.post('/setup/start', loginLimiter, async (req: Request, res: Response) => {
  try {
    const { username } = req.body;
    if (!username || typeof username !== 'string' || username.trim().length === 0) {
      return res.status(400).json({ error: 'El nombre de usuario es requerido' });
    }

    const db = getDatabase();
    const userCount = await db.get<{ cnt: number }>('SELECT COUNT(*) as cnt FROM app_users');
    if ((userCount?.cnt ?? 0) > 0) {
      return res.status(400).json({ error: 'La configuración ya fue completada' });
    }

    // Create household
    const householdResult = await db.run(
      `INSERT INTO households (slug, name) VALUES ('primary', 'Mi hogar')`
    );
    const householdId = householdResult.lastID!;

    // Create legacy user (for PIN compatibility)
    const hashedPin = bcrypt.hashSync('1234', 10);
    const legacyResult = await db.run(
      'INSERT INTO users (username, pin) VALUES (?, ?)',
      username.trim(),
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
    res.status(500).json({ error: 'Error en la configuración' });
  }
});

// ===== POST /setup/finish =====
router.post('/setup/finish', loginLimiter, async (req: Request, res: Response) => {
  try {
    const { userId, credential } = req.body;
    if (!userId || !credential) {
      return res.status(400).json({ error: 'Faltan userId o credencial' });
    }

    const challenge = getAndDeleteChallenge(`setup:${userId}`);
    if (!challenge) {
      return res.status(400).json({ error: 'Desafío expirado o inválido' });
    }

    const verification = await verifyRegistrationResponse({
      response: credential,
      expectedChallenge: challenge,
      expectedOrigin: origin,
      expectedRPID: rpID,
    });

    if (!verification.verified || !verification.registrationInfo) {
      return res.status(400).json({ error: 'Error en el registro' });
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
    res.status(500).json({ error: 'Verificación del registro fallida' });
  }
});

export default router;

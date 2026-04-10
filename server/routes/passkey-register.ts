import { Router, Response } from 'express';
import {
  generateRegistrationOptions,
  verifyRegistrationResponse,
} from '@simplewebauthn/server';
import type { AuthenticatorTransportFuture } from '@simplewebauthn/server';
import { getDatabase } from '../db.js';
import { authenticateToken, AuthRequest } from '../auth.js';
import {
  rpName,
  rpID,
  origin,
  setChallenge,
  getAndDeleteChallenge,
  deriveDeviceName,
} from './passkey-shared.js';

const router = Router();

// ===== POST /register/start -- add passkey to current user =====
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
    res.status(500).json({ error: 'Error al iniciar el registro' });
  }
});

// ===== POST /register/finish =====
router.post('/register/finish', authenticateToken, async (req: AuthRequest, res: Response) => {
  try {
    const userId = req.user!.id;
    const { credential } = req.body;
    if (!credential) {
      return res.status(400).json({ error: 'Credencial no proporcionada' });
    }

    const challenge = getAndDeleteChallenge(`register:${userId}`);
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

    res.json({ success: true });
  } catch (error) {
    console.error('Register finish error:', error);
    res.status(500).json({ error: 'Verificación del registro fallida' });
  }
});

// ===== GET /passkeys -- list user's passkeys =====
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
    res.status(500).json({ error: 'Error al obtener passkeys' });
  }
});

export default router;

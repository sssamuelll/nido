import { Router, Request, Response } from 'express';
import {
  generateAuthenticationOptions,
  verifyAuthenticationResponse,
} from '@simplewebauthn/server';
import type { AuthenticatorTransportFuture } from '@simplewebauthn/server';
import { getDatabase } from '../db.js';
import { createAppSession, setAppSessionCookie, verifyPin } from '../auth.js';
import {
  rpID,
  origin,
  setChallenge,
  getAndDeleteChallenge,
  loginLimiter,
} from './passkey-auth.js';

const router = Router();

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
    res.status(500).json({ error: 'Error al iniciar autenticación' });
  }
});

// ===== POST /login/finish =====
router.post('/login/finish', loginLimiter, async (req: Request, res: Response) => {
  try {
    const { credential } = req.body;
    if (!credential) {
      return res.status(400).json({ error: 'Credencial no proporcionada' });
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
      return res.status(400).json({ error: 'Credencial no encontrada' });
    }

    const challenge = getAndDeleteChallenge('login');
    if (!challenge) {
      return res.status(400).json({ error: 'Desafío expirado o inválido' });
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
      return res.status(400).json({ error: 'Autenticación fallida' });
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
      return res.status(400).json({ error: 'Usuario no encontrado' });
    }

    const { sessionToken } = await createAppSession(user.id, req);
    setAppSessionCookie(res, sessionToken);

    res.json({ user: { id: user.id, username: user.username } });
  } catch (error) {
    console.error('Login finish error:', error);
    res.status(500).json({ error: 'Verificación de autenticación fallida' });
  }
});

// ===== POST /pin-login -- PIN-based login (migration / fallback) =====
router.post('/pin-login', loginLimiter, async (req: Request, res: Response) => {
  try {
    const { username, pin } = req.body;
    if (!username || !pin) {
      return res.status(400).json({ error: 'Usuario y PIN requeridos' });
    }

    const db = getDatabase();
    const user = await db.get<{ id: number; username: string }>(
      'SELECT id, username FROM app_users WHERE username = ?',
      username
    );
    if (!user) {
      return res.status(404).json({ error: 'Usuario no encontrado' });
    }

    const isValid = await verifyPin(user.id, pin);
    if (!isValid) {
      return res.status(401).json({ error: 'PIN incorrecto' });
    }

    const { sessionToken } = await createAppSession(user.id, req);
    setAppSessionCookie(res, sessionToken);

    res.json({ user: { id: user.id, username: user.username } });
  } catch (error) {
    console.error('PIN login error:', error);
    res.status(500).json({ error: 'Error al iniciar sesión' });
  }
});

export default router;

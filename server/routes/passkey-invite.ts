import { Router, Request, Response } from 'express';
import bcrypt from 'bcryptjs';
import { randomBytes } from 'crypto';
import {
  generateRegistrationOptions,
  verifyRegistrationResponse,
} from '@simplewebauthn/server';
import { getDatabase } from '../db.js';
import { appOrigin } from '../config.js';
import {
  authenticateToken,
  AuthRequest,
  createAppSession,
  setAppSessionCookie,
} from '../auth.js';
import {
  rpName,
  rpID,
  origin,
  setChallenge,
  getAndDeleteChallenge,
  loginLimiter,
  deriveDeviceName,
} from './passkey-shared.js';
import { validate, inviteCreateSchema, InviteCreateInput } from '../validation.js';

const router = Router();

// ===== POST /invite -- create invitation =====
router.post('/invite', authenticateToken, validate(inviteCreateSchema), async (req: AuthRequest, res: Response) => {
  try {
    const userId = req.user!.id;
    const { relink_user_id } =
      (req as AuthRequest & { validatedData: InviteCreateInput }).validatedData;

    const db = getDatabase();
    const appUser = await db.get<{ household_id: number }>(
      'SELECT household_id FROM app_users WHERE id = ?',
      userId
    );
    if (!appUser) {
      return res.status(404).json({ error: 'Usuario no encontrado' });
    }

    if (!relink_user_id) {
      // Check household has < 2 members
      const memberCount = await db.get<{ cnt: number }>(
        'SELECT COUNT(*) as cnt FROM app_users WHERE household_id = ?',
        appUser.household_id
      );
      if ((memberCount?.cnt ?? 0) >= 2) {
        return res.status(400).json({ error: 'El hogar ya tiene el máximo de miembros' });
      }
    } else {
      // Validate relink user exists in same household
      const relinkUser = await db.get<{ id: number }>(
        'SELECT id FROM app_users WHERE id = ? AND household_id = ?',
        relink_user_id,
        appUser.household_id
      );
      if (!relinkUser) {
        return res.status(400).json({ error: 'Usuario a revincular no encontrado en el hogar' });
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
    res.status(500).json({ error: 'Error al crear invitación' });
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
      return res.status(404).json({ error: 'Invitación no encontrada o ya utilizada' });
    }

    if (new Date(invitation.expires_at).getTime() < Date.now()) {
      return res.status(410).json({ error: 'La invitación ha expirado' });
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
    res.status(500).json({ error: 'Error al obtener información de la invitación' });
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
      return res.status(404).json({ error: 'Invitación no encontrada o ya utilizada' });
    }

    if (new Date(invitation.expires_at).getTime() < Date.now()) {
      return res.status(410).json({ error: 'La invitación ha expirado' });
    }

    let userName: string;
    // TS 5.7+ tightened Uint8Array's generic; @simplewebauthn/server demands
    // ArrayBuffer-backed (no SharedArrayBuffer). TextEncoder returns the
    // wider ArrayBufferLike, so wrap with `new Uint8Array(...)` to copy
    // into a fresh ArrayBuffer.
    let userID: Uint8Array<ArrayBuffer>;

    if (invitation.relink_user_id) {
      const existingUser = await db.get<{ id: number; username: string }>(
        'SELECT id, username FROM app_users WHERE id = ?',
        invitation.relink_user_id
      );
      if (!existingUser) {
        return res.status(400).json({ error: 'Usuario a revincular no encontrado' });
      }
      userName = existingUser.username;
      userID = new Uint8Array(new TextEncoder().encode(String(existingUser.id)));
    } else {
      // For new users, use a temporary identifier based on the token
      userName = `new-user-${req.params.token.slice(0, 8)}`;
      userID = new Uint8Array(new TextEncoder().encode(`invite:${req.params.token}`));
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
    res.status(500).json({ error: 'Error al generar opciones de registro' });
  }
});

// ===== POST /invite/:token/claim =====
router.post('/invite/:token/claim', loginLimiter, async (req: Request, res: Response) => {
  try {
    const { username, credential } = req.body;
    if (!credential) {
      return res.status(400).json({ error: 'Credencial no proporcionada' });
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
      return res.status(404).json({ error: 'Invitación no encontrada o ya utilizada' });
    }

    if (new Date(invitation.expires_at).getTime() < Date.now()) {
      return res.status(410).json({ error: 'La invitación ha expirado' });
    }

    const challenge = getAndDeleteChallenge(`invite:${req.params.token}`);
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

    let appUserId: number;

    if (invitation.relink_user_id) {
      // Relink: attach credential to existing user
      appUserId = invitation.relink_user_id;
    } else {
      // New user: create legacy user + app_user
      if (!username || typeof username !== 'string' || username.trim().length === 0) {
        return res.status(400).json({ error: 'El nombre de usuario es requerido para nuevos usuarios' });
      }

      const hashedPin = bcrypt.hashSync('1234', 10);
      const legacyResult = await db.run(
        'INSERT INTO users (username, pin) VALUES (?, ?)',
        username.trim(),
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
    res.status(500).json({ error: 'Error al reclamar invitación' });
  }
});

export default router;

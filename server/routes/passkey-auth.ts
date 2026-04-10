import { Router } from 'express';
import rateLimit from 'express-rate-limit';
import { appOrigin } from '../config.js';
import setupRouter from './passkey-setup.js';
import loginRouter from './passkey-login.js';
import registerRouter from './passkey-register.js';
import inviteRouter from './passkey-invite.js';

// ---------------------------------------------------------------------------
// WebAuthn relying-party config (shared)
// ---------------------------------------------------------------------------
export const rpName = 'Nido';
export const rpID = new URL(appOrigin).hostname;
export const origin = appOrigin;

// ---------------------------------------------------------------------------
// In-memory challenge store (5-minute TTL, single-process only)
// ---------------------------------------------------------------------------
const challenges = new Map<string, { challenge: string; expires: number }>();

export const setChallenge = (key: string, challenge: string) => {
  challenges.set(key, { challenge, expires: Date.now() + 5 * 60 * 1000 });
};

export const getAndDeleteChallenge = (key: string): string | null => {
  const entry = challenges.get(key);
  challenges.delete(key);
  if (!entry || entry.expires < Date.now()) return null;
  return entry.challenge;
};

// ---------------------------------------------------------------------------
// Helpers (shared)
// ---------------------------------------------------------------------------
export const deriveDeviceName = (ua?: string): string => {
  if (!ua) return 'Unknown device';
  if (/iPhone|iPad/.test(ua)) return 'iOS device';
  if (/Android/.test(ua)) return 'Android device';
  if (/Macintosh/.test(ua)) return 'Mac';
  if (/Windows/.test(ua)) return 'Windows PC';
  if (/Linux/.test(ua)) return 'Linux device';
  return 'Unknown device';
};

// ---------------------------------------------------------------------------
// Rate limiter for login/setup endpoints (shared)
// ---------------------------------------------------------------------------
export const loginLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 10,
  message: { error: 'Demasiados intentos de inicio de sesión, intenta de nuevo en 15 minutos' },
  standardHeaders: true,
  legacyHeaders: false,
});

// ---------------------------------------------------------------------------
// Router — mounts all sub-routers
// ---------------------------------------------------------------------------
const router = Router();

router.use(setupRouter);
router.use(loginRouter);
router.use(registerRouter);
router.use(inviteRouter);

export default router;

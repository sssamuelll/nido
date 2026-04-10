import rateLimit from 'express-rate-limit';
import { appOrigin } from '../config.js';

// WebAuthn relying-party config
export const rpName = 'Nido';
export const rpID = new URL(appOrigin).hostname;
export const origin = appOrigin;

// In-memory challenge store (5-minute TTL, single-process only)
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

// Helpers
export const deriveDeviceName = (ua?: string): string => {
  if (!ua) return 'Dispositivo desconocido';
  if (/iPhone|iPad/.test(ua)) return 'Dispositivo iOS';
  if (/Android/.test(ua)) return 'Dispositivo Android';
  if (/Macintosh/.test(ua)) return 'Mac';
  if (/Windows/.test(ua)) return 'Windows PC';
  if (/Linux/.test(ua)) return 'Dispositivo Linux';
  return 'Dispositivo desconocido';
};

// Rate limiter for login/setup endpoints
export const loginLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 10,
  message: { error: 'Demasiados intentos, intenta de nuevo en 15 minutos' },
  standardHeaders: true,
  legacyHeaders: false,
});

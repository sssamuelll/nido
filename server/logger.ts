/**
 * Structured logging for the Nido server (issue #88).
 *
 * Two exports:
 *   - `logger`       — root pino instance for boot/init/util contexts (no request scope).
 *   - `httpLogger`   — pino-http middleware that attaches `req.log` (a child logger
 *                      with `reqId` + `userId`) and emits one log line per request.
 *
 * Production emits one JSON line per event; development uses pino-pretty for
 * readable colored output. Tests run at level 'silent' to avoid stdout noise.
 *
 * Sensitive fields (auth cookies, Authorization header, body PIN/password/token)
 * are redacted before the line is written.
 */
import pino from 'pino';
import pinoHttp from 'pino-http';
import * as Sentry from '@sentry/node';
import { randomUUID } from 'crypto';
import type { IncomingMessage, ServerResponse } from 'http';
import { isDevelopment, isProduction, isTest, logLevel } from './config.js';

const level =
  logLevel ??
  (isProduction ? 'info' : isTest ? 'silent' : 'debug');

// One-time-use invite tokens live in URL path segments (server/routes/passkey-invite.ts).
// pino-http's default per-request log includes req.url, which would otherwise emit
// the raw token on every hit. Persisted/aggregated logs could then expose live
// invitations to anyone with log access — redact at the serializer boundary.
export const sanitizeUrl = (url: string | undefined): string | undefined => {
  if (!url) return url;
  return url.replace(/\/invite\/[^/?]+/g, '/invite/[REDACTED]');
};

const transport = isDevelopment
  ? {
      target: 'pino-pretty',
      options: {
        colorize: true,
        translateTime: 'SYS:HH:MM:ss.l',
        ignore: 'pid,hostname',
      },
    }
  : undefined;

export const logger = pino({
  level,
  base: { service: 'nido', env: process.env.NODE_ENV ?? 'development' },
  redact: {
    paths: [
      'req.headers.cookie',
      'req.headers.authorization',
      'req.headers["x-nido-request"]',
      'req.body.pin',
      'req.body.password',
      'req.body.token',
      '*.pin',
      '*.password',
    ],
    censor: '[REDACTED]',
  },
  // Bridge pino → Sentry: any level≥error log carrying `{ err }` (the convention
  // the 18 call sites migrated in #88 already use) is forwarded to Sentry as an
  // exception. Sentry.captureException is a no-op when SENTRY_DSN_SERVER is
  // unset, so this path is safe in dev/test/CI.
  hooks: {
    logMethod(inputArgs, method, level) {
      if (level >= 50 /* error */) {
        const first = inputArgs[0];
        const err =
          first && typeof first === 'object' && 'err' in first
            ? (first as { err: unknown }).err
            : null;
        if (err instanceof Error) {
          Sentry.captureException(err);
        } else if (typeof first === 'string') {
          Sentry.captureMessage(first, 'error');
        }
      }
      return method.apply(this, inputArgs);
    },
  },
  transport,
});

const pickInboundRequestId = (raw: unknown): string | undefined => {
  const value = Array.isArray(raw) ? raw[0] : raw;
  if (typeof value !== 'string') return undefined;
  const trimmed = value.trim();
  if (trimmed.length === 0 || trimmed.length > 64) return undefined;
  return trimmed;
};

export const httpLogger = pinoHttp({
  logger,
  genReqId: (req: IncomingMessage) =>
    pickInboundRequestId(req.headers['x-request-id']) ?? randomUUID(),
  // pino-http evaluates customProps per emitted log entry (not only at
  // request-complete), so any req.log.* call that fires *after*
  // authenticateToken populates req.user picks up the real userId.
  // If a future pino-http upgrade narrows this to the summary log only,
  // userId would silently regress to null for in-handler logs — re-verify.
  customProps: (req: IncomingMessage) => {
    const user = (req as IncomingMessage & { user?: { id?: number } }).user;
    return { userId: user?.id ?? null };
  },
  serializers: {
    req: (req: IncomingMessage & { id?: string; remoteAddress?: string }) => ({
      id: req.id,
      method: req.method,
      url: sanitizeUrl(req.url),
      remoteAddress: req.remoteAddress,
    }),
    res: (res: ServerResponse) => ({ statusCode: res.statusCode }),
  },
  customLogLevel: (_req, res, err) => {
    if (err || res.statusCode >= 500) return 'error';
    if (res.statusCode >= 400) return 'warn';
    return 'info';
  },
});

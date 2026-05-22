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
  // exception, tagged with the request scope so events cross-reference with log
  // lines. Sentry.captureException is a no-op when SENTRY_DSN_SERVER is unset,
  // so this path is safe in dev/test/CI.
  //
  // Drop behavior: level≥error logs that lack `{ err }` AND aren't string-first
  // (e.g. `req.log.error({ count: 42 }, 'msg')`) emit a log line but no Sentry
  // event. All 18 migrated #88 call sites pass `{ err }`, so this is intentional
  // — we don't want bare info-payload logs flooding Sentry.
  //
  // `this` in pino's logMethod is the calling logger (child or root), so
  // `.bindings()` returns whatever the caller owns: empty for the root logger,
  // `req.id` for an httpLogger-attached `req.log`, and `+ userId` after
  // `authenticateToken` re-childs (see server/auth.ts).
  hooks: {
    logMethod(inputArgs, method, level) {
      if (level >= 50 /* error */) {
        const first = inputArgs[0];
        const err =
          first && typeof first === 'object' && 'err' in first
            ? (first as { err: unknown }).err
            : null;
        const bindings = (this as pino.Logger).bindings() as {
          req?: { id?: string };
          userId?: number | string | null;
        };
        Sentry.withScope((scope) => {
          if (bindings.req?.id) scope.setTag('reqId', String(bindings.req.id));
          if (bindings.userId != null) scope.setUser({ id: String(bindings.userId) });
          if (err instanceof Error) {
            Sentry.captureException(err);
          } else if (typeof first === 'string') {
            Sentry.captureMessage(first, 'error');
          }
        });
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
  // pino-http evaluates customProps ONCE at middleware-mount time (verified
  // empirically against pino-http v10), not per emitted log entry. Since
  // authenticateToken runs *after* httpLogger, `req.user` is undefined here —
  // this customProps populates the request-summary log line with `userId:null`.
  // The real userId is surfaced via `authenticateToken` re-childing `req.log`
  // with the bound user id (see server/auth.ts). In-handler logs and the
  // Sentry scope hook above read it from the child's bindings.
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

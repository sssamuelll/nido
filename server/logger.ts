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
import { randomUUID } from 'crypto';
import type { IncomingMessage, ServerResponse } from 'http';
import { isDevelopment, isProduction, isTest } from './config.js';

const level =
  process.env.LOG_LEVEL ??
  (isProduction ? 'info' : isTest ? 'silent' : 'debug');

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
  customProps: (req: IncomingMessage) => {
    const user = (req as IncomingMessage & { user?: { id?: number } }).user;
    return { userId: user?.id ?? null };
  },
  serializers: {
    req: (req: IncomingMessage & { id?: string; remoteAddress?: string }) => ({
      id: req.id,
      method: req.method,
      url: req.url,
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

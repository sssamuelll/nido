/**
 * Sentry server-side initialization (issue #89).
 *
 * Imported as the literal first line of `server/index.ts` so `@sentry/node`
 * patches `http` and `express` before they are required — Sentry's
 * auto-instrumentation depends on observing those modules at load time.
 *
 * `enabled: !!dsn` makes this a no-op when SENTRY_DSN_SERVER is unset, so the
 * server boots identically in local dev, in CI (no secrets), and in production
 * before Samuel sets the env var.
 */
// dotenv runs BEFORE Sentry import: ESM evaluates imports top-down, so the
// `process.env.SENTRY_DSN_SERVER` read below must happen after .env is loaded.
// The deploy plan (PR #256 §5) puts the DSN in `/var/www/nido/.env`, which is
// the dotenv path — without this line the env var is undefined at init time,
// `enabled: !!dsn` evaluates to false, and Sentry silently never fires.
// dotenv only mutates `process.env`; it doesn't touch http/express, so
// Sentry's instrument-first constraint is preserved.
import 'dotenv/config';
import * as Sentry from '@sentry/node';

const dsn = process.env.SENTRY_DSN_SERVER;

Sentry.init({
  dsn,
  enabled: !!dsn,
  environment: process.env.NODE_ENV ?? 'development',
  tracesSampleRate: 0.1,
  sendDefaultPii: false,
});

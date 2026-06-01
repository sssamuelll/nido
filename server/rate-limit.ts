import rateLimit from 'express-rate-limit';
import { config } from './config.js';
import type { AuthRequest } from './auth.js';

export interface ApiLimiterOverrides {
  /** Requests allowed per window. Defaults to config.rateLimitMax. */
  limit?: number;
  /** Window length in ms. Defaults to config.rateLimitWindowMs. */
  windowMs?: number;
}

/**
 * Rate limiter for the authenticated API, keyed per user (not per IP, so two
 * people behind one NAT don't share a bucket).
 *
 * Sizing rationale — why the default is not small:
 * Nido is a data-rich SPA with no cross-view cache (a deliberate choice, see
 * src/lib/cacheBus.ts). Every view switch re-mounts and re-fetches, the
 * Dashboard alone fires ~10 parallel requests per mount, and React.StrictMode
 * doubles that in dev. The original cap of 120/min therefore rejected ordinary
 * navigation with a 429 ("Demasiadas peticiones"). The default now lives in
 * config (RATE_LIMIT_MAX, default 600/min) and is overridable per environment,
 * leaving generous headroom for navigation while still catching a runaway
 * client or a single abusive account.
 *
 * `overrides` exist so tests can assert limiting behaviour deterministically
 * without depending on the production default.
 */
export function createApiLimiter(overrides: ApiLimiterOverrides = {}) {
  return rateLimit({
    windowMs: overrides.windowMs ?? config.rateLimitWindowMs,
    limit: overrides.limit ?? config.rateLimitMax,
    keyGenerator: (req) => (req as AuthRequest).user?.id?.toString() || req.ip || 'unknown',
    message: { error: 'Demasiadas peticiones, intenta de nuevo en un momento' },
    standardHeaders: true,
    legacyHeaders: false,
  });
}

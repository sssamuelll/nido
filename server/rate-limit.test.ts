import { describe, it, expect } from 'vitest';
import express from 'express';
import request from 'supertest';
import { createApiLimiter } from './rate-limit.js';
import { config } from './config.js';

// A minimal app: a middleware stamps req.user from a header so we can exercise
// the per-user keyGenerator, then the limiter, then a trivial route.
function makeApp(overrides?: { limit?: number; windowMs?: number }) {
  const app = express();
  app.set('trust proxy', 1);
  app.use((req, _res, next) => {
    const id = req.header('x-test-user');
    if (id) (req as express.Request & { user?: { id: number } }).user = { id: Number(id) };
    next();
  });
  app.use(createApiLimiter(overrides));
  app.get('/ping', (_req, res) => res.json({ ok: true }));
  return app;
}

describe('apiLimiter', () => {
  it('allows requests up to the cap, then 429s with the Spanish message', async () => {
    const app = makeApp({ limit: 3, windowMs: 60_000 });
    const agent = request(app);

    for (let i = 0; i < 3; i++) {
      const res = await agent.get('/ping').set('x-test-user', '1');
      expect(res.status).toBe(200);
    }

    const limited = await agent.get('/ping').set('x-test-user', '1');
    expect(limited.status).toBe(429);
    expect(limited.body).toEqual({
      error: 'Demasiadas peticiones, intenta de nuevo en un momento',
    });
  });

  it('keys per user — one user hitting the cap does not limit another', async () => {
    const app = makeApp({ limit: 2, windowMs: 60_000 });
    const agent = request(app);

    await agent.get('/ping').set('x-test-user', '1');
    await agent.get('/ping').set('x-test-user', '1');
    const u1Limited = await agent.get('/ping').set('x-test-user', '1');
    expect(u1Limited.status).toBe(429);

    // A different user has an independent bucket.
    const u2 = await agent.get('/ping').set('x-test-user', '2');
    expect(u2.status).toBe(200);
  });

  // Regression guard for the "Demasiadas peticiones while navigating" bug.
  // The original 120/min rejected normal navigation (Dashboard alone is ~10
  // requests/mount, doubled by dev StrictMode, with no cross-view cache). Keep
  // a healthy floor so a future tweak can't silently reintroduce the 429 storm.
  it('default cap is generous enough for per-view fan-out', () => {
    expect(config.rateLimitMax).toBeGreaterThanOrEqual(300);
    expect(config.rateLimitWindowMs).toBe(60_000);
  });

  it('lets a Dashboard-sized burst through under the default cap', async () => {
    // One heavy screen mount in dev (StrictMode-doubled ~20 requests) plus a
    // couple of view switches — must not 429 under the configured default.
    const app = makeApp(); // config defaults
    const agent = request(app);

    for (let i = 0; i < 24; i++) {
      const res = await agent.get('/ping').set('x-test-user', '99');
      expect(res.status).toBe(200);
    }
  });
});

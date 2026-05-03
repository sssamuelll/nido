import { describe, expect, it, vi } from 'vitest';
import request from 'supertest';

// Bypass real auth: the test asserts middleware wiring on the route, not the
// auth flow. authenticateToken sets req.user and calls next().
vi.mock('./auth.js', async (importOriginal) => {
  const actual = await importOriginal<typeof import('./auth.js')>();
  return {
    ...actual,
    authenticateToken: (req: any, _res: any, next: any) => {
      req.user = { id: 1, username: 'samuel' };
      next();
    },
  };
});

// Stub the db so the GET handler can finish on the happy path (200) without
// a real database. The 400 cases never reach the handler — the validateQuery
// middleware short-circuits before db is touched — so the mock is permissive.
vi.mock('./db.js', () => ({
  getDatabase: () => ({
    get: vi.fn().mockResolvedValue({ household_id: 1 }),
    all: vi.fn().mockResolvedValue([]),
    run: vi.fn().mockResolvedValue({ lastID: 1 }),
  }),
  initDatabase: vi.fn(),
  notifyPartner: vi.fn(),
  findAppUserIdByUsername: vi.fn(),
}));

// Imported AFTER the vi.mock calls so the mocks are in effect when index.ts
// resolves its imports. NODE_ENV='test' (set by vitest.config.ts:27 + test/setup.ts)
// gates startServer() so no port is bound and initDatabase is not called.
import { app } from './index.js';

describe('GET /api/categories — wiring (Decision 6B)', () => {
  it('rejects ?context=household with HTTP 400', async () => {
    const res = await request(app).get('/api/categories?context=household');
    expect(res.status).toBe(400);
    expect(res.body).toMatchObject({ error: 'Error de validación' });
    expect(Array.isArray(res.body.details)).toBe(true);
  });

  it('accepts ?context=personal with HTTP 200', async () => {
    const res = await request(app).get('/api/categories?context=personal');
    expect(res.status).toBe(200);
  });

  it('rejects ?context=a&context=b (qs array) with HTTP 400', async () => {
    const res = await request(app).get('/api/categories?context=a&context=b');
    expect(res.status).toBe(400);
    expect(res.body).toMatchObject({ error: 'Error de validación' });
  });

  it('rejects ?context[$ne]=shared (qs object) with HTTP 400', async () => {
    const res = await request(app).get('/api/categories?context[$ne]=shared');
    expect(res.status).toBe(400);
    expect(res.body).toMatchObject({ error: 'Error de validación' });
  });
});

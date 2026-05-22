import { describe, expect, it, vi } from 'vitest';
import request from 'supertest';

// Toggle to flip the mocked db.get('SELECT 1') between happy path and throw.
// Set before each request to assert both branches of the /api/health handler.
let dbShouldThrow = false;

vi.mock('./db.js', () => ({
  getDatabase: () => ({
    get: vi.fn().mockImplementation(async () => {
      if (dbShouldThrow) throw new Error('forced db failure');
      return { '1': 1 };
    }),
    all: vi.fn().mockResolvedValue([]),
    run: vi.fn().mockResolvedValue({ lastID: 1 }),
  }),
  initDatabase: vi.fn(),
  notifyPartner: vi.fn(),
  findAppUserIdByUsername: vi.fn(),
}));

// Imported AFTER vi.mock so the mock is in effect when index.ts resolves db.js.
// NODE_ENV='test' (vitest.config.ts:30) gates startServer() so no port is bound.
import { app } from './index.js';

describe('GET /api/health', () => {
  it('returns 200 with db:"ok" on the happy path', async () => {
    dbShouldThrow = false;
    const res = await request(app).get('/api/health');
    expect(res.status).toBe(200);
    expect(res.body).toMatchObject({ status: 'ok', db: 'ok' });
    expect(typeof res.body.timestamp).toBe('string');
  });

  it('returns 503 with db:"error" when the db ping throws', async () => {
    dbShouldThrow = true;
    const res = await request(app).get('/api/health');
    expect(res.status).toBe(503);
    expect(res.body).toMatchObject({ status: 'degraded', db: 'error' });
    expect(typeof res.body.timestamp).toBe('string');
  });
});

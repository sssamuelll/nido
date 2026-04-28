import { beforeEach, describe, expect, it, vi } from 'vitest';
import {
  createMockDb,
  createMockResponse,
  getRouteMiddleware as resolveRouteMiddleware,
} from '../../test/route-helpers';

const mockDb = createMockDb();

vi.mock('../db.js', () => ({
  getDatabase: vi.fn(() => mockDb),
  notifyPartner: vi.fn(),
  findAppUserIdByUsername: vi.fn(),
}));

import cyclesRouter from './cycles.js';
import { cycleApproveSchema } from '../validation.js';

// F2 — POST /api/cycles/approve. Until this PR the route destructured
// `const { cycle_id } = req.body` and only ran a falsy guard. An object
// or array slipped past, hit sqlite3's binding layer, and surfaced as a
// generic 500 thirty frames later. Its sibling /household/budget/approve
// was already hardened (commit 55c3422); this test brings cycles to parity.

const getRouteMiddleware = (path: string, method: 'get' | 'post' | 'put' | 'delete') =>
  resolveRouteMiddleware(cyclesRouter, path, method);

const createResponse = createMockResponse;

const runMiddleware = (
  middleware: (req: unknown, res: unknown, next: unknown) => void,
  body: unknown,
) => {
  const req = { body };
  const res = createResponse();
  const next = vi.fn();
  middleware(req, res, next);
  return { req, res, next };
};

describe('cycleApproveSchema (POST /api/cycles/approve)', () => {
  it('accepts a positive integer cycle_id', () => {
    expect(cycleApproveSchema.safeParse({ cycle_id: 7 }).success).toBe(true);
  });

  it('rejects when cycle_id is missing', () => {
    expect(cycleApproveSchema.safeParse({}).success).toBe(false);
  });

  it('rejects cycle_id of wrong type (string, boolean, object, array)', () => {
    expect(cycleApproveSchema.safeParse({ cycle_id: '7' }).success).toBe(false);
    expect(cycleApproveSchema.safeParse({ cycle_id: true }).success).toBe(false);
    expect(cycleApproveSchema.safeParse({ cycle_id: { $gt: 0 } }).success).toBe(false);
    expect(cycleApproveSchema.safeParse({ cycle_id: [1] }).success).toBe(false);
  });

  it('rejects cycle_id = NaN, Infinity, -Infinity, -0, 0, negative, float', () => {
    expect(cycleApproveSchema.safeParse({ cycle_id: Number.NaN }).success).toBe(false);
    expect(cycleApproveSchema.safeParse({ cycle_id: Number.POSITIVE_INFINITY }).success).toBe(false);
    expect(cycleApproveSchema.safeParse({ cycle_id: Number.NEGATIVE_INFINITY }).success).toBe(false);
    expect(cycleApproveSchema.safeParse({ cycle_id: -0 }).success).toBe(false);
    expect(cycleApproveSchema.safeParse({ cycle_id: 0 }).success).toBe(false);
    expect(cycleApproveSchema.safeParse({ cycle_id: -3 }).success).toBe(false);
    expect(cycleApproveSchema.safeParse({ cycle_id: 1.5 }).success).toBe(false);
  });

  it('rejects empty string (would have passed the legacy truthy check via coercion)', () => {
    expect(cycleApproveSchema.safeParse({ cycle_id: '' }).success).toBe(false);
  });

  it('rejects extra unknown fields (strict — surfaces typos like cycleId)', () => {
    expect(
      cycleApproveSchema.safeParse({ cycle_id: 7, cycleId: 7 }).success,
    ).toBe(false);
    expect(
      cycleApproveSchema.safeParse({ cycle_id: 7, household_id: 99 }).success,
    ).toBe(false);
  });

  it('rejects null, undefined, array, empty object', () => {
    expect(cycleApproveSchema.safeParse(null).success).toBe(false);
    expect(cycleApproveSchema.safeParse(undefined).success).toBe(false);
    expect(cycleApproveSchema.safeParse([]).success).toBe(false);
    expect(cycleApproveSchema.safeParse({}).success).toBe(false);
  });

  it('does not mutate the input', () => {
    const input = { cycle_id: 7 };
    const snapshot = { ...input };
    cycleApproveSchema.safeParse(input);
    expect(input).toEqual(snapshot);
  });

  it('is deterministic', () => {
    expect(cycleApproveSchema.safeParse({ cycle_id: 12 }))
      .toEqual(cycleApproveSchema.safeParse({ cycle_id: 12 }));
  });
});

describe('POST /api/cycles/approve — middleware integration', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('responds 400 with structured details when cycle_id is missing', () => {
    const middleware = getRouteMiddleware('/approve', 'post');
    const { res, next } = runMiddleware(middleware, {});
    expect(next).not.toHaveBeenCalled();
    expect(res.status).toHaveBeenCalledWith(400);
    const payload = res.json.mock.calls[0][0];
    expect(payload.error).toBe('Error de validación');
    expect(payload.details.some((d: string) => d.startsWith('cycle_id:'))).toBe(true);
  });

  it('responds 400 when cycle_id is an object (would have been a 500 from sqlite3 binding)', () => {
    const middleware = getRouteMiddleware('/approve', 'post');
    const { res, next } = runMiddleware(middleware, { cycle_id: { $gt: 0 } });
    expect(next).not.toHaveBeenCalled();
    expect(res.status).toHaveBeenCalledWith(400);
  });

  it('responds 400 when cycle_id is the string "7" (was silently coerced before)', () => {
    const middleware = getRouteMiddleware('/approve', 'post');
    const { res, next } = runMiddleware(middleware, { cycle_id: '7' });
    expect(next).not.toHaveBeenCalled();
    expect(res.status).toHaveBeenCalledWith(400);
  });

  it('calls next() and exposes validatedData when cycle_id is a positive integer', () => {
    const middleware = getRouteMiddleware('/approve', 'post');
    const { req, res, next } = runMiddleware(middleware, { cycle_id: 12 });
    expect(next).toHaveBeenCalled();
    expect(res.status).not.toHaveBeenCalled();
    expect((req as { validatedData?: unknown }).validatedData).toEqual({ cycle_id: 12 });
  });
});

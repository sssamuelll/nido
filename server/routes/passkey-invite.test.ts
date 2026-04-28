import { beforeEach, describe, expect, it, vi } from 'vitest';
import {
  createMockDb,
  createMockResponse,
  getRouteLayer as resolveRouteLayer,
} from '../../test/route-helpers';

vi.mock('../db.js', () => ({
  getDatabase: vi.fn(() => createMockDb()),
}));

vi.mock('../config.js', () => ({
  appOrigin: 'https://example.test',
}));

vi.mock('../auth.js', () => ({
  authenticateToken: vi.fn(),
  createAppSession: vi.fn(),
  setAppSessionCookie: vi.fn(),
}));

vi.mock('./passkey-shared.js', () => ({
  rpName: 'Nido Test',
  rpID: 'example.test',
  origin: 'https://example.test',
  setChallenge: vi.fn(),
  getAndDeleteChallenge: vi.fn(),
  loginLimiter: (_req: unknown, _res: unknown, next: () => void) => next(),
  deriveDeviceName: vi.fn(),
}));

import passkeyInviteRouter from './passkey-invite.js';
import { inviteCreateSchema } from '../validation.js';

// F3 — POST /auth/invite. Until this PR the handler did
// `const { relink_user_id } = req.body` with only a falsy guard.
// `relink_user_id = 0` skipped the relink branch and silently created
// a fresh-device invitation; an object/array crashed sqlite3 with
// TypeError surfaced as a contextless 500. The schema rejects both at
// the boundary with a structured 400.

const getRouteMiddleware = (
  path: string,
  method: 'get' | 'post' | 'put' | 'delete',
  index: number,
) => resolveRouteLayer(passkeyInviteRouter, path, method).route!.stack[index].handle;

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

describe('inviteCreateSchema (POST /auth/invite)', () => {
  it('accepts an empty body (no relink_user_id → fresh device invitation)', () => {
    expect(inviteCreateSchema.safeParse({}).success).toBe(true);
  });

  it('accepts a positive integer relink_user_id', () => {
    expect(inviteCreateSchema.safeParse({ relink_user_id: 5 }).success).toBe(true);
  });

  it('accepts relink_user_id explicitly absent (undefined)', () => {
    expect(inviteCreateSchema.safeParse({ relink_user_id: undefined }).success).toBe(true);
  });

  it('rejects relink_user_id of wrong type (string, boolean, object, array)', () => {
    expect(inviteCreateSchema.safeParse({ relink_user_id: '5' }).success).toBe(false);
    expect(inviteCreateSchema.safeParse({ relink_user_id: true }).success).toBe(false);
    expect(inviteCreateSchema.safeParse({ relink_user_id: { id: 5 } }).success).toBe(false);
    expect(inviteCreateSchema.safeParse({ relink_user_id: [5] }).success).toBe(false);
  });

  it('rejects relink_user_id = NaN, Infinity, -Infinity', () => {
    expect(inviteCreateSchema.safeParse({ relink_user_id: Number.NaN }).success).toBe(false);
    expect(inviteCreateSchema.safeParse({ relink_user_id: Number.POSITIVE_INFINITY }).success).toBe(false);
    expect(inviteCreateSchema.safeParse({ relink_user_id: Number.NEGATIVE_INFINITY }).success).toBe(false);
  });

  it('rejects relink_user_id = 0 (the silent-drift bug: was treated as "no relink")', () => {
    expect(inviteCreateSchema.safeParse({ relink_user_id: 0 }).success).toBe(false);
  });

  it('rejects relink_user_id = -0 and negative integers', () => {
    expect(inviteCreateSchema.safeParse({ relink_user_id: -0 }).success).toBe(false);
    expect(inviteCreateSchema.safeParse({ relink_user_id: -1 }).success).toBe(false);
  });

  it('rejects non-integer relink_user_id (1.5)', () => {
    expect(inviteCreateSchema.safeParse({ relink_user_id: 1.5 }).success).toBe(false);
  });

  it('rejects extra unknown fields (strict)', () => {
    expect(
      inviteCreateSchema.safeParse({ relink_user_id: 5, household_id: 99 }).success,
    ).toBe(false);
    expect(
      inviteCreateSchema.safeParse({ relinkUserId: 5 }).success,
    ).toBe(false);
  });

  it('rejects null, array', () => {
    expect(inviteCreateSchema.safeParse(null).success).toBe(false);
    expect(inviteCreateSchema.safeParse([]).success).toBe(false);
  });

  it('does not mutate the input', () => {
    const input = { relink_user_id: 5 };
    const snapshot = { ...input };
    inviteCreateSchema.safeParse(input);
    expect(input).toEqual(snapshot);
  });
});

describe('POST /auth/invite — middleware integration', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('passes through with an empty body (fresh-device invitation)', () => {
    const middleware = getRouteMiddleware('/invite', 'post', 1);
    const { req, res, next } = runMiddleware(middleware, {});
    expect(next).toHaveBeenCalled();
    expect(res.status).not.toHaveBeenCalled();
    expect((req as { validatedData?: unknown }).validatedData).toEqual({});
  });

  it('responds 400 when relink_user_id is 0 (semantic-drift bug)', () => {
    const middleware = getRouteMiddleware('/invite', 'post', 1);
    const { res, next } = runMiddleware(middleware, { relink_user_id: 0 });
    expect(next).not.toHaveBeenCalled();
    expect(res.status).toHaveBeenCalledWith(400);
    const payload = res.json.mock.calls[0][0];
    expect(payload.error).toBe('Error de validación');
    expect(payload.details.some((d: string) => d.startsWith('relink_user_id:'))).toBe(true);
  });

  it('responds 400 when relink_user_id is an object', () => {
    const middleware = getRouteMiddleware('/invite', 'post', 1);
    const { res, next } = runMiddleware(middleware, { relink_user_id: { id: 5 } });
    expect(next).not.toHaveBeenCalled();
    expect(res.status).toHaveBeenCalledWith(400);
  });
});

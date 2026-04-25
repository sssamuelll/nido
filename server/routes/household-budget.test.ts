import { beforeEach, describe, expect, it, vi } from 'vitest';

const mockDb = {
  all: vi.fn(),
  get: vi.fn(),
  run: vi.fn(),
};

vi.mock('../db.js', () => ({
  getDatabase: vi.fn(() => mockDb),
  notifyPartner: vi.fn(),
  findAppUserIdByUsername: vi.fn(),
}));

import householdBudgetRouter from './household-budget.js';
import {
  householdBudgetUpdateSchema,
  householdBudgetApproveSchema,
} from '../validation.js';

const getRouteLayer = (path: string, method: 'get' | 'post' | 'put' | 'delete') =>
  householdBudgetRouter.stack.find(
    (entry: any) => entry.route?.path === path && entry.route?.methods?.[method]
  );

const getRouteHandler = (path: string, method: 'get' | 'post' | 'put' | 'delete') => {
  const layer = getRouteLayer(path, method);
  return layer.route.stack[layer.route.stack.length - 1].handle;
};

const getRouteMiddleware = (path: string, method: 'get' | 'post' | 'put' | 'delete') => {
  const layer = getRouteLayer(path, method);
  return layer.route.stack[layer.route.stack.length - 2].handle;
};

const createResponse = () => {
  const res: any = {};
  res.status = vi.fn().mockReturnValue(res);
  res.json = vi.fn().mockReturnValue(res);
  res.send = vi.fn().mockReturnValue(res);
  return res;
};

const runMiddleware = (
  middleware: (req: any, res: any, next: any) => void,
  body: unknown,
) => {
  const req: any = { body };
  const res = createResponse();
  const next = vi.fn();
  middleware(req, res, next);
  return { req, res, next };
};

describe('householdBudgetUpdateSchema (PUT /api/household/budget)', () => {
  it('accepts a valid total_amount payload', () => {
    expect(householdBudgetUpdateSchema.safeParse({ total_amount: 1500 }).success).toBe(true);
  });

  it('accepts a valid personal_budget payload', () => {
    expect(householdBudgetUpdateSchema.safeParse({ personal_budget: 500 }).success).toBe(true);
  });

  it('rejects when both required fields are absent (at-least-one)', () => {
    expect(householdBudgetUpdateSchema.safeParse({}).success).toBe(false);
  });

  it('rejects total_amount of the wrong type (string, boolean, object, array)', () => {
    expect(householdBudgetUpdateSchema.safeParse({ total_amount: '1500' }).success).toBe(false);
    expect(householdBudgetUpdateSchema.safeParse({ total_amount: true }).success).toBe(false);
    expect(householdBudgetUpdateSchema.safeParse({ total_amount: { $gt: 0 } }).success).toBe(false);
    expect(householdBudgetUpdateSchema.safeParse({ total_amount: [1500] }).success).toBe(false);
  });

  it('rejects total_amount = NaN', () => {
    expect(householdBudgetUpdateSchema.safeParse({ total_amount: NaN }).success).toBe(false);
  });

  it('rejects total_amount = Infinity / -Infinity', () => {
    expect(householdBudgetUpdateSchema.safeParse({ total_amount: Infinity }).success).toBe(false);
    expect(householdBudgetUpdateSchema.safeParse({ total_amount: -Infinity }).success).toBe(false);
  });

  it('accepts total_amount = -0 as zero', () => {
    const result = householdBudgetUpdateSchema.safeParse({ total_amount: -0 });
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.total_amount === 0 || Object.is(result.data.total_amount, -0)).toBe(true);
    }
  });

  it('rejects negative numeric values', () => {
    expect(householdBudgetUpdateSchema.safeParse({ total_amount: -1 }).success).toBe(false);
    expect(householdBudgetUpdateSchema.safeParse({ personal_budget: -0.01 }).success).toBe(false);
  });

  it('rejects values above the cap (DoS / overflow defense)', () => {
    expect(householdBudgetUpdateSchema.safeParse({ total_amount: 1e10 }).success).toBe(false);
    expect(householdBudgetUpdateSchema.safeParse({ personal_budget: Number.MAX_SAFE_INTEGER }).success).toBe(false);
  });

  it('rejects extra unknown fields (strict mode — surfaces typos like totalAmount)', () => {
    expect(
      householdBudgetUpdateSchema.safeParse({ total_amount: 100, totalAmount: 999 }).success,
    ).toBe(false);
    expect(
      householdBudgetUpdateSchema.safeParse({ total_amount: 100, household_id: 7 }).success,
    ).toBe(false);
  });

  it('rejects null, undefined, array, empty object as the whole body', () => {
    expect(householdBudgetUpdateSchema.safeParse(null).success).toBe(false);
    expect(householdBudgetUpdateSchema.safeParse(undefined).success).toBe(false);
    expect(householdBudgetUpdateSchema.safeParse([]).success).toBe(false);
    expect(householdBudgetUpdateSchema.safeParse({}).success).toBe(false);
  });

  it('accepts both fields together', () => {
    const result = householdBudgetUpdateSchema.safeParse({ total_amount: 2000, personal_budget: 500 });
    expect(result.success).toBe(true);
  });

  it('is deterministic for identical inputs (pure parse)', () => {
    const a = householdBudgetUpdateSchema.safeParse({ total_amount: 1234.56 });
    const b = householdBudgetUpdateSchema.safeParse({ total_amount: 1234.56 });
    expect(a).toEqual(b);
  });

  it('does not mutate the input object', () => {
    const input = { total_amount: 1000 };
    const snapshot = { ...input };
    householdBudgetUpdateSchema.safeParse(input);
    expect(input).toEqual(snapshot);
  });
});

describe('householdBudgetApproveSchema (POST /api/household/budget/approve)', () => {
  it('accepts a positive integer approval_id', () => {
    expect(householdBudgetApproveSchema.safeParse({ approval_id: 7 }).success).toBe(true);
  });

  it('rejects when approval_id is missing', () => {
    expect(householdBudgetApproveSchema.safeParse({}).success).toBe(false);
  });

  it('rejects approval_id of wrong type (string, boolean, object)', () => {
    expect(householdBudgetApproveSchema.safeParse({ approval_id: '7' }).success).toBe(false);
    expect(householdBudgetApproveSchema.safeParse({ approval_id: true }).success).toBe(false);
    expect(householdBudgetApproveSchema.safeParse({ approval_id: { $gt: 0 } }).success).toBe(false);
  });

  it('rejects approval_id = NaN, Infinity, -Infinity, -0, 0, negative, float', () => {
    expect(householdBudgetApproveSchema.safeParse({ approval_id: NaN }).success).toBe(false);
    expect(householdBudgetApproveSchema.safeParse({ approval_id: Infinity }).success).toBe(false);
    expect(householdBudgetApproveSchema.safeParse({ approval_id: -Infinity }).success).toBe(false);
    expect(householdBudgetApproveSchema.safeParse({ approval_id: -0 }).success).toBe(false);
    expect(householdBudgetApproveSchema.safeParse({ approval_id: 0 }).success).toBe(false);
    expect(householdBudgetApproveSchema.safeParse({ approval_id: -3 }).success).toBe(false);
    expect(householdBudgetApproveSchema.safeParse({ approval_id: 1.5 }).success).toBe(false);
  });

  it('rejects empty string (would have passed the legacy truthy check via coercion)', () => {
    expect(householdBudgetApproveSchema.safeParse({ approval_id: '' }).success).toBe(false);
  });

  it('rejects extra unknown fields (strict)', () => {
    expect(
      householdBudgetApproveSchema.safeParse({ approval_id: 7, total_amount: 999 }).success,
    ).toBe(false);
  });

  it('rejects null, undefined, array', () => {
    expect(householdBudgetApproveSchema.safeParse(null).success).toBe(false);
    expect(householdBudgetApproveSchema.safeParse(undefined).success).toBe(false);
    expect(householdBudgetApproveSchema.safeParse([]).success).toBe(false);
  });
});

describe('PUT /api/household/budget — middleware integration', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('responds 400 with structured details when total_amount is a string and never reaches the handler', () => {
    const middleware = getRouteMiddleware('/', 'put');
    const { res, next } = runMiddleware(middleware, { total_amount: '1500' });
    expect(next).not.toHaveBeenCalled();
    expect(res.status).toHaveBeenCalledWith(400);
    const payload = res.json.mock.calls[0][0];
    expect(payload.error).toBe('Error de validación');
    expect(payload.details.some((d: string) => d.startsWith('total_amount:'))).toBe(true);
  });

  it('responds 400 when total_amount is NaN (would corrupt SQLite NUMERIC column)', () => {
    const middleware = getRouteMiddleware('/', 'put');
    const { res, next } = runMiddleware(middleware, { total_amount: NaN });
    expect(next).not.toHaveBeenCalled();
    expect(res.status).toHaveBeenCalledWith(400);
  });

  it('responds 400 when total_amount is Infinity (would persist as NULL or overflow)', () => {
    const middleware = getRouteMiddleware('/', 'put');
    const { res, next } = runMiddleware(middleware, { total_amount: Infinity });
    expect(next).not.toHaveBeenCalled();
    expect(res.status).toHaveBeenCalledWith(400);
  });

  it('responds 400 when total_amount is a nested object (NoSQL-style operator payload)', () => {
    const middleware = getRouteMiddleware('/', 'put');
    const { res, next } = runMiddleware(middleware, { total_amount: { $gt: 0 } });
    expect(next).not.toHaveBeenCalled();
    expect(res.status).toHaveBeenCalledWith(400);
  });

  it('responds 400 when personal_budget is negative (would silently corrupt the partner dashboard)', () => {
    const middleware = getRouteMiddleware('/', 'put');
    const { res, next } = runMiddleware(middleware, { personal_budget: -50000 });
    expect(next).not.toHaveBeenCalled();
    expect(res.status).toHaveBeenCalledWith(400);
  });

  it('responds 400 with empty body (was previously a no-op 200 update)', () => {
    const middleware = getRouteMiddleware('/', 'put');
    const { res, next } = runMiddleware(middleware, {});
    expect(next).not.toHaveBeenCalled();
    expect(res.status).toHaveBeenCalledWith(400);
  });

  it('does not leak the raw input value back in the error payload (no PII in errors)', () => {
    const middleware = getRouteMiddleware('/', 'put');
    const { res } = runMiddleware(middleware, { total_amount: 'secret-token-do-not-echo' });
    const payload = res.json.mock.calls[0][0];
    const serialized = JSON.stringify(payload);
    expect(serialized).not.toContain('secret-token-do-not-echo');
  });

  it('passes through a valid payload to the handler with strong types', async () => {
    const middleware = getRouteMiddleware('/', 'put');
    const req: any = { body: { personal_budget: 500 } };
    const res = createResponse();
    const next = vi.fn();
    middleware(req, res, next);
    expect(next).toHaveBeenCalledOnce();
    expect(req.validatedData).toEqual({ personal_budget: 500 });
    expect(typeof req.validatedData.personal_budget).toBe('number');
  });

  it('validated payload reaches the SQL UPDATE as a real number (not a string)', async () => {
    mockDb.get
      .mockResolvedValueOnce({ household_id: 3 })
      .mockResolvedValueOnce({
        id: 9,
        household_id: 3,
        total_amount: 2000,
        personal_samuel: 500,
        personal_maria: 500,
      });
    mockDb.run.mockResolvedValue({ changes: 1 });

    const handler = getRouteHandler('/', 'put');
    const req: any = {
      validatedData: { personal_budget: 600 },
      user: { id: 1, username: 'samuel' },
    };
    const res = createResponse();

    await handler(req, res);

    const updateCall = mockDb.run.mock.calls.find(
      (c: any[]) => typeof c[0] === 'string' && c[0].startsWith('UPDATE household_budget SET'),
    );
    expect(updateCall).toBeDefined();
    expect(updateCall![1]).toBe(600);
    expect(typeof updateCall![1]).toBe('number');
    expect(res.json).toHaveBeenCalledWith({ success: true, pending_approval: false });
  });
});

describe('POST /api/household/budget/approve — middleware integration', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('responds 400 when approval_id is a string (was previously truthy and reached SQL)', () => {
    const middleware = getRouteMiddleware('/approve', 'post');
    const { res, next } = runMiddleware(middleware, { approval_id: '7' });
    expect(next).not.toHaveBeenCalled();
    expect(res.status).toHaveBeenCalledWith(400);
  });

  it('responds 400 when approval_id is missing', () => {
    const middleware = getRouteMiddleware('/approve', 'post');
    const { res, next } = runMiddleware(middleware, {});
    expect(next).not.toHaveBeenCalled();
    expect(res.status).toHaveBeenCalledWith(400);
  });

  it('responds 400 when approval_id is a float (would mismatch INTEGER PK)', () => {
    const middleware = getRouteMiddleware('/approve', 'post');
    const { res, next } = runMiddleware(middleware, { approval_id: 1.5 });
    expect(next).not.toHaveBeenCalled();
    expect(res.status).toHaveBeenCalledWith(400);
  });

  it('responds 400 with extra fields (strict)', () => {
    const middleware = getRouteMiddleware('/approve', 'post');
    const { res, next } = runMiddleware(middleware, { approval_id: 7, override: 999 });
    expect(next).not.toHaveBeenCalled();
    expect(res.status).toHaveBeenCalledWith(400);
  });

  it('passes through a valid integer approval_id with strong type', () => {
    const middleware = getRouteMiddleware('/approve', 'post');
    const req: any = { body: { approval_id: 42 } };
    const res = createResponse();
    const next = vi.fn();
    middleware(req, res, next);
    expect(next).toHaveBeenCalledOnce();
    expect(req.validatedData).toEqual({ approval_id: 42 });
    expect(typeof req.validatedData.approval_id).toBe('number');
  });
});

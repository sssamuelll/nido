import { beforeEach, describe, expect, it, vi } from 'vitest';

const mockDb = {
  all: vi.fn(),
  get: vi.fn(),
  run: vi.fn(),
};

vi.mock('../db.js', () => ({
  getDatabase: vi.fn(() => mockDb),
  syncBudgetAllocationsForMonth: vi.fn(),
  createNotification: vi.fn(),
  notifyPartner: vi.fn(),
}));

import { notifyPartner, syncBudgetAllocationsForMonth } from '../db.js';
import budgetsRouter from './budgets.js';

const getRouteHandler = (path: string, method: 'get' | 'put') => {
  const layer = budgetsRouter.stack.find(
    (entry: any) => entry.route?.path === path && entry.route?.methods?.[method]
  );
  return layer.route.stack[layer.route.stack.length - 1].handle;
};

const createResponse = () => {
  const res: any = {};
  res.status = vi.fn().mockReturnValue(res);
  res.json = vi.fn().mockReturnValue(res);
  return res;
};

describe('budgets routes privacy', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockDb.all.mockReset();
    mockDb.get.mockReset();
    mockDb.run.mockReset();
  });

  it('returns only the authenticated user personal budget allocation', async () => {
    mockDb.get
      .mockResolvedValueOnce({
        id: 1,
        month: '2026-03',
        shared_available: 2000,
        personal_samuel: 450,
        personal_maria: 700,
      })
      .mockResolvedValueOnce(null); // pending approval query
    mockDb.all.mockResolvedValue([{ category: 'Restaurant', amount: 200 }]);
    const handler = getRouteHandler('/', 'get');
    const req: any = { validatedMonth: '2026-03', query: {}, user: { id: 2, username: 'maria' } };
    const res = createResponse();

    await handler(req, res);

    expect(res.json).toHaveBeenCalledWith({
      id: 1,
      month: '2026-03',
      shared_available: 2000,
      personal_budget: 700,
      pending_approval: null,
      categories: { Restaurant: 200 },
    });
  });

  it('returns pending approval with requester username so UI can render the correct actor', async () => {
    mockDb.get
      .mockResolvedValueOnce({
        id: 1,
        month: '2026-03',
        shared_available: 2000,
        personal_samuel: 450,
        personal_maria: 700,
      })
      .mockResolvedValueOnce({
        id: 8,
        budget_id: 1,
        shared_available: 2300,
        requested_by_user_id: 1,
        requested_by_username: 'samuel',
      });
    mockDb.all.mockResolvedValue([{ category: 'Restaurant', amount: 200 }]);

    const handler = getRouteHandler('/', 'get');
    const req: any = { validatedMonth: '2026-03', query: {}, user: { id: 2, username: 'maria' } };
    const res = createResponse();

    await handler(req, res);

    expect(res.json).toHaveBeenCalledWith(expect.objectContaining({
      pending_approval: expect.objectContaining({
        requested_by_user_id: 1,
        requested_by_username: 'samuel',
      }),
    }));
  });

  it('creates a targeted notification for the partner when a shared budget change is requested', async () => {
    mockDb.get
      .mockResolvedValueOnce({
        id: 1,
        month: '2026-03',
        shared_available: 2000,
        personal_samuel: 450,
        personal_maria: 700,
      })
      .mockResolvedValueOnce(null)
      .mockResolvedValueOnce({ household_id: 1 })
      .mockResolvedValueOnce({ id: 2 });
    mockDb.run
      .mockResolvedValueOnce({ lastID: 11 });

    const handler = getRouteHandler('/', 'put');
    const req: any = {
      validatedData: {
        month: '2026-03',
        shared_available: 2400,
      },
      user: { id: 1, username: 'samuel' },
    };
    const res = createResponse();

    await handler(req, res);

    expect(notifyPartner).toHaveBeenCalledWith(
      1,
      'samuel',
      'budget_change_requested',
      'Cambio de presupuesto',
      '{name} solicita cambiar el presupuesto a €2400',
      expect.objectContaining({
        approval_id: 11,
        requested_by_user_id: 1,
        requested_by_username: 'samuel',
        shared_available: 2400,
      })
    );
    expect(res.json).toHaveBeenCalledWith({ success: true, pending_approval: true });
  });

  it('updates only the authenticated user personal budget while preserving the partner allocation', async () => {
    mockDb.get
      .mockResolvedValueOnce({
        id: 1,
        month: '2026-03',
        shared_available: 2000,
        personal_samuel: 450,
        personal_maria: 700,
      })
      .mockResolvedValueOnce({ household_id: 1 });
    mockDb.run.mockResolvedValue({ changes: 1 });
    const handler = getRouteHandler('/', 'put');
    const req: any = {
      validatedData: {
        month: '2026-03',
        personal_budget: 650,
        categories: { Restaurant: 250 },
      },
      user: { id: 2, username: 'maria' },
    };
    const res = createResponse();

    await handler(req, res);

    expect(mockDb.run).toHaveBeenNthCalledWith(
      1,
      expect.stringContaining('personal_maria'),
      650,
      1
    );
    expect(syncBudgetAllocationsForMonth).toHaveBeenCalledWith('2026-03');
    expect(res.json).toHaveBeenCalledWith({ success: true, pending_approval: false });
  });
});

import { beforeEach, describe, expect, it, vi } from 'vitest';

const mockDb = {
  all: vi.fn(),
  get: vi.fn(),
  run: vi.fn(),
};

vi.mock('../db.js', () => ({
  getDatabase: vi.fn(() => mockDb),
  findAppUserIdByUsername: vi.fn(),
  notifyPartner: vi.fn(),
}));

import expensesRouter from './expenses.js';

const getRouteHandler = (path: string, method: 'get' | 'delete') => {
  const layer = expensesRouter.stack.find(
    (entry: any) => entry.route?.path === path && entry.route?.methods?.[method]
  );
  return layer.route.stack[layer.route.stack.length - 1].handle;
};

const createResponse = () => {
  const res: any = {};
  res.status = vi.fn().mockReturnValue(res);
  res.json = vi.fn().mockReturnValue(res);
  res.send = vi.fn().mockReturnValue(res);
  return res;
};

describe('expenses routes privacy', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('creates a new expense using the authenticated user as paid_by', async () => {
    mockDb.run
      .mockResolvedValueOnce({ lastID: 11 })
      .mockResolvedValueOnce({ changes: 1 });
    mockDb.get
      .mockResolvedValueOnce({ household_id: 3 })
      .mockResolvedValueOnce({
        id: 11,
        description: 'Coffee',
        amount: 3.5,
        category: 'Cafe',
        date: '2026-03-29',
        paid_by: 'samuel',
        paid_by_user_id: 1,
        type: 'shared',
        status: 'paid',
      });

    const handler = getRouteHandler('/', 'post');
    const req: any = {
      validatedData: {
        description: 'Coffee',
        amount: 3.5,
        category: 'Cafe',
        date: '2026-03-29',
        type: 'shared',
        status: 'paid',
      },
      user: { id: 1, username: 'samuel' },
    };
    const res = createResponse();

    await handler(req, res);

    expect(mockDb.run).toHaveBeenNthCalledWith(
      1,
      expect.stringContaining('INSERT INTO expenses'),
      'Coffee',
      3.5,
      'Cafe',
      '2026-03-29',
      'samuel',
      undefined,
      'shared',
      'paid'
    );
    expect(res.status).toHaveBeenCalledWith(201);
    expect(res.json).toHaveBeenCalledWith(expect.objectContaining({
      id: 11,
      paid_by: 'samuel',
    }));
  });

  it('filters month expenses to shared plus the authenticated user personal expenses', async () => {
    mockDb.all.mockResolvedValue([
      { id: 1, description: 'Shared dinner', type: 'shared', paid_by: 'maria' },
      { id: 2, description: 'Headphones', type: 'personal', paid_by: 'samuel' },
    ]);
    const handler = getRouteHandler('/', 'get');
    const req: any = { validatedMonth: '2026-03', user: { id: 1, username: 'samuel' } };
    const res = createResponse();

    await handler(req, res);

    expect(mockDb.all).toHaveBeenCalledWith(
      expect.stringContaining("type = 'shared'"),
      '2026-03%',
      1,
      'samuel'
    );
    expect(res.json).toHaveBeenCalledWith([
      { id: 1, description: 'Shared dinner', type: 'shared', paid_by: 'maria' },
      { id: 2, description: 'Headphones', type: 'personal', paid_by: 'samuel' },
    ]);
  });

  it('returns summary with only the authenticated user personal spend and visible transactions', async () => {
    mockDb.get.mockResolvedValue({
      month: '2026-03',
      total_budget: 3000,
      rent: 1000,
      savings: 300,
      personal_samuel: 450,
      personal_maria: 700,
    });
    mockDb.all
      .mockResolvedValueOnce([
        { id: 1, description: 'Shared dinner', amount: 50, category: 'Restaurant', date: '2026-03-10', paid_by: 'maria', type: 'shared', created_at: '2026-03-10T12:00:00Z' },
        { id: 2, description: 'Headphones', amount: 80, category: 'Otros', date: '2026-03-08', paid_by: 'samuel', type: 'personal', created_at: '2026-03-08T10:00:00Z' },
      ])
      .mockResolvedValueOnce([
        { category: 'Restaurant', amount: 200 },
      ]);
    const handler = getRouteHandler('/summary', 'get');
    const req: any = { validatedMonth: '2026-03', user: { id: 1, username: 'samuel' } };
    const res = createResponse();

    await handler(req, res);

    expect(res.json).toHaveBeenCalledWith(expect.objectContaining({
      budget: expect.objectContaining({ personal: 450 }),
      spending: expect.objectContaining({ totalSpent: 130 }),
      personal: {
        owner: 'samuel',
        spent: 80,
        budget: 450,
      },
      recentTransactions: expect.arrayContaining([
        expect.objectContaining({ description: 'Shared dinner' }),
        expect.objectContaining({ description: 'Headphones' }),
      ]),
    }));
  });

  it('returns an empty-state summary instead of 404 when the month has no budget yet', async () => {
    mockDb.get.mockResolvedValueOnce(undefined);
    mockDb.all
      .mockResolvedValueOnce([])
      .mockResolvedValueOnce([])
      .mockResolvedValueOnce([]);

    const handler = getRouteHandler('/summary', 'get');
    const req: any = { validatedMonth: '2026-03', user: { id: 1, username: 'samuel' } };
    const res = createResponse();

    await handler(req, res);

    expect(res.status).not.toHaveBeenCalledWith(404);
    expect(res.json).toHaveBeenCalledWith({
      budget: {
        total: 0,
        rent: 0,
        savings: 0,
        personal: 0,
        availableShared: 0,
      },
      spending: {
        totalSpent: 0,
        totalSharedSpent: 0,
        remainingShared: 0,
      },
      personal: {
        owner: 'samuel',
        spent: 0,
        budget: 0,
      },
      categoryBreakdown: [],
      personalCategoryBreakdown: [],
      recentTransactions: [],
    });
  });

  it('allows deleting shared expenses for either user', async () => {
    mockDb.get.mockResolvedValue({ id: 7, paid_by: 'maria', type: 'shared' });
    mockDb.run.mockResolvedValue({ changes: 1 });
    const handler = getRouteHandler('/:id', 'delete');
    const req: any = { params: { id: '7' }, user: { id: 1, username: 'samuel' } };
    const res = createResponse();

    await handler(req, res);

    expect(mockDb.run).toHaveBeenCalledWith('DELETE FROM expenses WHERE id = ?', '7');
    expect(res.status).toHaveBeenCalledWith(204);
  });

  it('forbids deleting another user personal expense', async () => {
    mockDb.get.mockResolvedValue({ id: 9, paid_by: 'maria', type: 'personal' });
    const handler = getRouteHandler('/:id', 'delete');
    const req: any = { params: { id: '9' }, user: { id: 1, username: 'samuel' } };
    const res = createResponse();

    await handler(req, res);

    expect(res.status).toHaveBeenCalledWith(403);
    expect(res.json).toHaveBeenCalledWith({
      error: 'Forbidden: You can only delete your own personal expenses'
    });
  });
});

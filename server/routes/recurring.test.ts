import { beforeEach, describe, expect, it, vi } from 'vitest';
import {
  createMockDb,
  createMockResponse,
  getRouteHandler,
} from '../../test/route-helpers';

const mockDb = createMockDb();

vi.mock('../db.js', () => ({
  getDatabase: vi.fn(() => mockDb),
  notifyPartner: vi.fn(),
}));

import recurringRouter from './recurring.js';

const handler = getRouteHandler(recurringRouter, '/:id', 'put');

const baseReq = (params: Record<string, string>, validatedData: Record<string, unknown>) => ({
  params,
  validatedData,
  user: { id: 1, username: 'samuel' },
  log: { error: vi.fn() },
});

describe('PUT /recurring/:id', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('builds a single UPDATE whose placeholders match the bound args (Maria edit case)', async () => {
    mockDb.get
      .mockResolvedValueOnce({ household_id: 1 })                             // app_users lookup
      .mockResolvedValueOnce({ id: 42, household_id: 1, type: 'shared' })     // existing recurring
      .mockResolvedValueOnce({ id: 7 })                                       // category lookup
      .mockResolvedValueOnce({ id: 42, name: 'Alquiler piso', amount: 335 }); // updated row

    const req = baseReq({ id: '42' }, {
      name: 'Alquiler piso',
      emoji: '🏠',
      amount: 335,
      category: 'Vivienda',
      type: 'shared',
      notes: undefined,
      every_n_cycles: 1,
    });
    const res = createMockResponse();

    await handler(req as any, res);

    // The UPDATE must be a single statement. The id placeholder must be the
    // LAST positional argument. This pins the regression: the old query
    // bound name/emoji into the WHERE clause via ?1/?2 trickery and SQLite
    // raised SQLITE_RANGE.
    expect(mockDb.run).toHaveBeenCalledTimes(1);
    const [sql, ...args] = mockDb.run.mock.calls[0];
    expect(sql).toMatch(/^UPDATE recurring_expenses SET .* WHERE id = \?$/);
    expect(args[args.length - 1]).toBe('42');

    // Argument count must equal placeholder count.
    const placeholderCount = (sql.match(/\?/g) ?? []).length;
    expect(args.length).toBe(placeholderCount);

    // Every column the caller sent must end up in SET.
    expect(sql).toContain('name = ?');
    expect(sql).toContain('emoji = ?');
    expect(sql).toContain('amount = ?');
    expect(sql).toContain('category = ?');
    expect(sql).toContain('category_id = ?');
    expect(sql).toContain('type = ?');
    expect(sql).toContain('every_n_cycles = ?');
    // notes was undefined → must NOT appear in SET.
    expect(sql).not.toContain('notes');

    expect(res.json).toHaveBeenCalledWith(expect.objectContaining({ id: 42 }));
  });

  it('omits SET clauses for fields the caller did not send', async () => {
    mockDb.get
      .mockResolvedValueOnce({ household_id: 1 })
      .mockResolvedValueOnce({ id: 42, household_id: 1, type: 'shared' })
      .mockResolvedValueOnce({ id: 42, name: 'Alquiler piso' });

    const req = baseReq({ id: '42' }, { name: 'Nuevo nombre' });
    const res = createMockResponse();

    await handler(req as any, res);

    const [sql, ...args] = mockDb.run.mock.calls[0];
    expect(sql).toBe('UPDATE recurring_expenses SET name = ? WHERE id = ?');
    expect(args).toEqual(['Nuevo nombre', '42']);
  });

  it('treats notes:null as an explicit clear (different from undefined)', async () => {
    mockDb.get
      .mockResolvedValueOnce({ household_id: 1 })
      .mockResolvedValueOnce({ id: 42, household_id: 1, type: 'shared' })
      .mockResolvedValueOnce({ id: 42 });

    const req = baseReq({ id: '42' }, { notes: null });
    const res = createMockResponse();

    await handler(req as any, res);

    const [sql, ...args] = mockDb.run.mock.calls[0];
    expect(sql).toBe('UPDATE recurring_expenses SET notes = ? WHERE id = ?');
    expect(args).toEqual([null, '42']);
  });

  it('skips UPDATE entirely if no fields were provided', async () => {
    mockDb.get
      .mockResolvedValueOnce({ household_id: 1 })
      .mockResolvedValueOnce({ id: 42, household_id: 1, type: 'shared' })
      .mockResolvedValueOnce({ id: 42 });

    const req = baseReq({ id: '42' }, {});
    const res = createMockResponse();

    await handler(req as any, res);

    expect(mockDb.run).not.toHaveBeenCalled();
    expect(res.json).toHaveBeenCalledWith(expect.objectContaining({ id: 42 }));
  });

  it('returns 404 if the recurring does not exist in the household', async () => {
    mockDb.get
      .mockResolvedValueOnce({ household_id: 1 })
      .mockResolvedValueOnce(undefined);

    const req = baseReq({ id: '999' }, { name: 'X' });
    const res = createMockResponse();

    await handler(req as any, res);

    expect(res.status).toHaveBeenCalledWith(404);
    expect(mockDb.run).not.toHaveBeenCalled();
  });
});

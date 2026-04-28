import { beforeEach, describe, expect, it, vi } from 'vitest';
import {
  createMockDb,
  createMockResponse,
  getRouteHandler as resolveRouteHandler,
} from '../../test/route-helpers';

const mockDb = createMockDb();

vi.mock('../db.js', () => ({
  getDatabase: vi.fn(() => mockDb),
  notifyPartner: vi.fn(),
  createNotification: vi.fn(),
}));

import goalsRouter from './goals.js';

const getRouteHandler = (path: string, method: 'get' | 'post' | 'put' | 'delete') =>
  resolveRouteHandler(goalsRouter, path, method);

const createResponse = createMockResponse;

describe('goals routes', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockDb.get.mockResolvedValue({ household_id: 1 });
  });

  describe('GET /', () => {
    it('returns shared goals plus own personal goals, filtering out other user personal goals', async () => {
      const allGoals = [
        { id: 1, name: 'Vacation', owner_type: 'shared', owner_user_id: null, household_id: 1 },
        { id: 2, name: 'My Laptop', owner_type: 'personal', owner_user_id: 1, household_id: 1 },
      ];
      mockDb.all.mockResolvedValue(allGoals);
      const handler = getRouteHandler('/', 'get');
      const req: any = { user: { id: 1, username: 'samuel' } };
      const res = createResponse();

      await handler(req, res);

      expect(mockDb.all).toHaveBeenCalledWith(
        expect.stringContaining("owner_type = 'shared'"),
        1,
        1
      );
      expect(res.json).toHaveBeenCalledWith(allGoals);
    });

    it('filters out other user personal goals via SQL query', async () => {
      // The SQL query itself filters, so db.all only returns visible goals
      mockDb.all.mockResolvedValue([
        { id: 1, name: 'Shared Goal', owner_type: 'shared', owner_user_id: null },
      ]);
      const handler = getRouteHandler('/', 'get');
      const req: any = { user: { id: 2, username: 'maria' } };
      const res = createResponse();

      await handler(req, res);

      // Verify the query filters by owner_user_id matching the request user id (2)
      expect(mockDb.all).toHaveBeenCalledWith(
        expect.stringContaining('owner_user_id = ?'),
        1,
        2
      );
    });
  });

  describe('POST /', () => {
    it('creates goal with correct household_id from auth user', async () => {
      mockDb.run.mockResolvedValue({ lastID: 10 });
      mockDb.get
        .mockResolvedValueOnce({ household_id: 1 }) // user lookup
        .mockResolvedValueOnce({ id: 10, name: 'Test', household_id: 1, owner_type: 'shared' }); // select created goal

      const handler = getRouteHandler('/', 'post');
      const req: any = {
        user: { id: 1, username: 'samuel' },
        validatedData: {
          name: 'Vacation Fund',
          icon: '\uD83C\uDFD6\uFE0F',
          target: 5000,
          deadline: 'Jul 2026',
          owner_type: 'shared',
        },
      };
      const res = createResponse();

      await handler(req, res);

      expect(mockDb.run).toHaveBeenCalledWith(
        expect.stringContaining('INSERT INTO goals'),
        1,             // household_id from user lookup
        'Vacation Fund',
        '\uD83C\uDFD6\uFE0F',
        5000,
        'Jul 2026',
        'shared',
        null           // owner_user_id null for shared
      );
      expect(res.status).toHaveBeenCalledWith(201);
    });

    it('sets owner_user_id when owner_type is personal', async () => {
      mockDb.run.mockResolvedValue({ lastID: 11 });
      mockDb.get
        .mockResolvedValueOnce({ household_id: 1 })
        .mockResolvedValueOnce({ id: 11, name: 'Laptop', owner_type: 'personal', owner_user_id: 1 });

      const handler = getRouteHandler('/', 'post');
      const req: any = {
        user: { id: 1, username: 'samuel' },
        validatedData: {
          name: 'Laptop',
          icon: '\uD83D\uDCBB',
          target: 2000,
          owner_type: 'personal',
        },
      };
      const res = createResponse();

      await handler(req, res);

      expect(mockDb.run).toHaveBeenCalledWith(
        expect.stringContaining('INSERT INTO goals'),
        1, 'Laptop', '\uD83D\uDCBB', 2000, null, 'personal', 1 // owner_user_id = req.user.id
      );
    });
  });

  describe('POST /:id/contribute', () => {
    it('inserts contribution and updates current from SUM', async () => {
      mockDb.get
        .mockResolvedValueOnce({ household_id: 1 }) // user lookup
        .mockResolvedValueOnce({ id: 5, household_id: 1, name: 'Goal', owner_type: 'shared' }) // existing goal
        .mockResolvedValueOnce({ id: 5, current: 150, name: 'Goal' }); // updated goal
      mockDb.run.mockResolvedValue({ lastID: 1, changes: 1 });

      const handler = getRouteHandler('/:id/contribute', 'post');
      const req: any = {
        params: { id: '5' },
        user: { id: 1, username: 'samuel' },
        validatedData: { amount: 50 },
      };
      const res = createResponse();

      await handler(req, res);

      // Verify contribution insert
      expect(mockDb.run).toHaveBeenCalledWith(
        expect.stringContaining('INSERT INTO goal_contributions'),
        '5', 1, 50
      );
      // Verify current updated from SUM
      expect(mockDb.run).toHaveBeenCalledWith(
        expect.stringContaining('SUM(amount)'),
        '5', '5'
      );
      expect(res.json).toHaveBeenCalledWith({ id: 5, current: 150, name: 'Goal' });
    });
  });

  describe('DELETE /:id', () => {
    it('removes contributions first then goal', async () => {
      mockDb.get
        .mockResolvedValueOnce({ household_id: 1 }) // user lookup
        .mockResolvedValueOnce({ id: 3, household_id: 1, owner_type: 'shared', owner_user_id: null }); // existing goal

      // Sequence log captures both ordering AND await-honoring: each db.run
      // pushes start:<tag> on call, yields to the microtask queue, then pushes
      // end:<tag> on resolution. Without await on a db.run, the next
      // start:<tag> appears before the previous end:<tag>.
      const sequence: string[] = [];
      const tag = (sql: string) =>
        sql === 'DELETE FROM goal_contributions WHERE goal_id = ?' ? 'contributions'
        : sql === 'DELETE FROM goals WHERE id = ?' ? 'goals'
        : `unknown(${sql})`;
      mockDb.run.mockImplementation(async (sql: string, ...rest: unknown[]) => {
        sequence.push(`start:${tag(sql)}:${JSON.stringify(rest)}`);
        await Promise.resolve();
        sequence.push(`end:${tag(sql)}`);
        return { changes: 1 };
      });

      const handler = getRouteHandler('/:id', 'delete');
      const req: any = {
        params: { id: '3' },
        user: { id: 1, username: 'samuel' },
      };
      const res = createResponse();

      await handler(req, res);

      expect(sequence).toEqual([
        'start:contributions:["3"]',
        'end:contributions',
        'start:goals:["3"]',
        'end:goals',
      ]);
      expect(res.status).toHaveBeenCalledWith(204);
    });
  });

  describe('PUT /:id', () => {
    it('returns 403 when editing another user personal goal', async () => {
      mockDb.get
        .mockResolvedValueOnce({ household_id: 1 }) // user lookup
        .mockResolvedValueOnce({ id: 7, household_id: 1, owner_type: 'personal', owner_user_id: 2 }); // maria's goal

      const handler = getRouteHandler('/:id', 'put');
      const req: any = {
        params: { id: '7' },
        user: { id: 1, username: 'samuel' },
        validatedData: { name: 'Hacked' },
      };
      const res = createResponse();

      await handler(req, res);

      expect(res.status).toHaveBeenCalledWith(403);
      expect(res.json).toHaveBeenCalledWith({
        error: 'Forbidden: You can only edit your own personal goals',
      });
    });

    it('returns 404 for goal not in household', async () => {
      mockDb.get
        .mockResolvedValueOnce({ household_id: 1 }) // user lookup
        .mockResolvedValueOnce(undefined); // goal not found

      const handler = getRouteHandler('/:id', 'put');
      const req: any = {
        params: { id: '99' },
        user: { id: 1, username: 'samuel' },
        validatedData: { name: 'Updated' },
      };
      const res = createResponse();

      await handler(req, res);

      expect(res.status).toHaveBeenCalledWith(404);
      expect(res.json).toHaveBeenCalledWith({ error: 'Goal not found' });
    });
  });
});

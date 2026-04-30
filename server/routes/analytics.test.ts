import { beforeEach, describe, expect, it, vi } from 'vitest';
import {
  createMockDb,
  createMockResponse,
  getRouteHandler as resolveRouteHandler,
} from '../../test/route-helpers';

const mockDb = createMockDb();

vi.mock('../db.js', () => ({
  getDatabase: vi.fn(() => mockDb),
}));

import analyticsRouter from './analytics.js';

const getRouteHandler = (path: string, method: 'get' | 'post' | 'put' | 'delete') =>
  resolveRouteHandler(analyticsRouter, path, method);

const createResponse = createMockResponse;

// Freeze current date for deterministic tests
const NOW = new Date('2026-03-15T12:00:00Z');

// The handler reads `req.validatedQuery` (populated by validateQuery middleware
// in the real route stack). Tests grab the inner handler directly via
// getRouteHandler(...) so the middleware never runs — we have to set
// validatedQuery on the request manually.
const createRequest = (overrides: any = {}): any => ({
  user: { id: 1, username: 'samuel', household_id: 1 },
  query: { months: '6', context: 'shared' },
  validatedQuery: { context: 'shared' },
  ...overrides,
});

describe('analytics routes', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    // Reset queues from `mockResolvedValueOnce`/`mockRejectedValueOnce` so a test that
    // fails before consuming all queued mocks doesn't leak them into the next test.
    // (clearAllMocks only clears call history, not queued one-time return values.)
    mockDb.all.mockReset();
    mockDb.get.mockReset();
    mockDb.run.mockReset();
    vi.useFakeTimers();
    vi.setSystemTime(NOW);
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  const setupDefaultMocks = (overrides: {
    dailyRows?: Array<{ date: string; total: number }>;
    periodTotal?: number;
    periodCount?: number;
    prevTotal?: number;
    householdId?: number | null;
    budget?: { total_amount: number; personal_samuel: number; personal_maria: number } | null;
    categoryRows?: Array<{ name: string; amount: number }>;
    categoryMeta?: Array<{ name: string; emoji?: string; color: string; budget_amount: number }>;
    categoryBudgets?: Array<{ name: string; budget_amount: number }>;
    overallAvg?: { total: number; count: number };
  } = {}) => {
    const {
      dailyRows = [],
      periodTotal = 0,
      periodCount = 0,
      prevTotal = 0,
      householdId = 1,
      budget = null,
      categoryRows = [],
      categoryMeta = [],
      categoryBudgets = [],
      overallAvg = { total: 0, count: 0 },
    } = overrides;

    // Call order in the handler when startDate + householdId both present:
    //   db.all  (1) dailyRows                  ← chart data (cumulative built in handler)
    //   db.get  (1) periodExpenses → { total } ← KPI totalSpent
    //   db.get  (2) periodCount → { count }    ← KPI totalExpenses
    //   db.get  (3) prevTotal → { total }      ← only when startDate, for vsPrevPeriod
    //   db.get  (4) householdUser → { household_id }
    //   db.get  (5) budget → HouseholdBudgetRow | null
    //   db.all  (2) categoryRows               ← breakdown
    //   db.all  (3) categoryMeta               ← only when householdId, for color/emoji/budget
    //   db.all  (4) categoryBudgets            ← only when householdId, for budget warnings
    //   db.get  (6) overallAvg                 ← only when startDate, for tip insight

    mockDb.all
      .mockResolvedValueOnce(dailyRows)
      .mockResolvedValueOnce(categoryRows)
      .mockResolvedValueOnce(categoryMeta)
      .mockResolvedValueOnce(categoryBudgets);

    mockDb.get
      .mockResolvedValueOnce({ total: periodTotal })
      .mockResolvedValueOnce({ count: periodCount })
      .mockResolvedValueOnce({ total: prevTotal })
      .mockResolvedValueOnce({ household_id: householdId })
      .mockResolvedValueOnce(budget)
      .mockResolvedValueOnce(overallAvg);
  };

  describe('GET /', () => {
    it('returns daily cumulative totals for the period', async () => {
      const dailyRows = [
        { date: '2026-03-01', total: 100 },
        { date: '2026-03-02', total: 200 },
        { date: '2026-03-03', total: 50 },
      ];
      setupDefaultMocks({ dailyRows });

      const handler = getRouteHandler('/', 'get');
      const req = createRequest({
        validatedQuery: { context: 'shared', start_date: '2026-03-01', end_date: '2026-03-31' },
      });
      const res = createResponse();

      await handler(req, res);

      const response = res.json.mock.calls[0][0];
      // Handler accumulates `total` cumulatively across the period (analytics.ts:81-85).
      expect(response.daily).toEqual([
        { date: '2026-03-01', total: 100 },
        { date: '2026-03-02', total: 300 },
        { date: '2026-03-03', total: 350 },
      ]);
      expect(response.daily).toHaveLength(3);
    });

    it('calculates KPIs correctly (totalSpent, avgTicket, vsPrevPeriod)', async () => {
      setupDefaultMocks({
        periodTotal: 600,
        periodCount: 20,
        prevTotal: 800,
        budget: { total_amount: 2000, personal_samuel: 500, personal_maria: 500 },
      });

      const handler = getRouteHandler('/', 'get');
      const req = createRequest({
        validatedQuery: { context: 'shared', start_date: '2026-03-01', end_date: '2026-03-31' },
      });
      const res = createResponse();

      await handler(req, res);

      const { kpis } = res.json.mock.calls[0][0];
      expect(kpis.totalSpent).toBe(600);
      expect(kpis.avgTicket).toBe(30);
      expect(kpis.totalExpenses).toBe(20);
      // (600 - 800) / 800 * 100 = -25%
      expect(kpis.vsPrevPeriod).toBe(-25);
      // netSavings = total_amount - totalSpent = 2000 - 600 = 1400
      expect(kpis.netSavings).toBe(1400);
    });

    it('calculates category breakdown percentages', async () => {
      const categoryRows = [
        { name: 'Restaurant', amount: 300 },
        { name: 'Ocio', amount: 200 },
        { name: 'Servicios', amount: 100 },
      ];
      setupDefaultMocks({
        categoryRows,
        categoryMeta: [
          { name: 'Restaurant', color: '#ff0000', budget_amount: 0 },
          { name: 'Ocio', color: '#00ff00', budget_amount: 0 },
        ],
      });

      const handler = getRouteHandler('/', 'get');
      const req = createRequest({
        validatedQuery: { context: 'shared', start_date: '2026-03-01', end_date: '2026-03-31' },
      });
      const res = createResponse();

      await handler(req, res);

      const { categories } = res.json.mock.calls[0][0];
      expect(categories).toHaveLength(3);
      // Handler also returns `emoji` and `budget` fields (see Test coverage gaps
      // in HALLAZGOS); we use toMatchObject so those don't break this test.
      // Restaurant: 300/600 = 50%
      expect(categories[0]).toMatchObject({ name: 'Restaurant', amount: 300, pct: 50, color: '#ff0000' });
      // Ocio: 200/600 = 33%
      expect(categories[1]).toMatchObject({ name: 'Ocio', amount: 200, pct: 33, color: '#00ff00' });
      // Servicios: 100/600 = 17%, hardcoded fallback color from CATEGORY_FALLBACK_COLORS
      expect(categories[2]).toMatchObject({ name: 'Servicios', amount: 100, pct: 17, color: '#c4a0e8' });
    });

    it('generates positive trend insight when spending decreased', async () => {
      const categoryRows = [
        { name: 'Restaurant', amount: 400 },
      ];
      setupDefaultMocks({
        dailyRows: [{ date: '2026-03-10', total: 400 }],
        periodTotal: 400,
        periodCount: 10,
        prevTotal: 600,
        categoryRows,
      });

      const handler = getRouteHandler('/', 'get');
      const req = createRequest({
        validatedQuery: { context: 'shared', start_date: '2026-03-01', end_date: '2026-03-31' },
      });
      const res = createResponse();

      await handler(req, res);

      const { insights } = res.json.mock.calls[0][0];
      const positiveTrend = insights.find((i: any) => i.type === 'positive' && i.message.includes('menos'));
      expect(positiveTrend).toBeDefined();
      // (600-400)/600*100 = 33%
      expect(positiveTrend.message).toContain('33%');
      expect(positiveTrend.message).toContain('Restaurant');
    });

    it('generates budget warning insight at 80%+', async () => {
      const categoryRows = [
        { name: 'Restaurant', amount: 450 },
      ];
      setupDefaultMocks({
        periodTotal: 450,
        periodCount: 15,
        prevTotal: 450, // same, no positive trend insight
        categoryRows,
        categoryBudgets: [{ name: 'Restaurant', budget_amount: 500 }], // 450/500 = 90%
      });

      const handler = getRouteHandler('/', 'get');
      const req = createRequest({
        validatedQuery: { context: 'shared', start_date: '2026-03-01', end_date: '2026-03-31' },
      });
      const res = createResponse();

      await handler(req, res);

      const { insights } = res.json.mock.calls[0][0];
      const budgetWarning = insights.find((i: any) => i.type === 'warning' && i.message.includes('presupuesto'));
      expect(budgetWarning).toBeDefined();
      expect(budgetWarning.message).toContain('Restaurant');
      expect(budgetWarning.message).toContain('90%');
    });

    it('returns different data for shared vs personal context', async () => {
      // Shared request
      setupDefaultMocks({ periodTotal: 1000, periodCount: 30 });
      const handler = getRouteHandler('/', 'get');
      const reqShared = createRequest({ validatedQuery: { context: 'shared' } });
      const resShared = createResponse();
      await handler(reqShared, resShared);

      // Check that the shared query uses type = 'shared'
      const sharedQuery = mockDb.all.mock.calls[0][0];
      expect(sharedQuery).toContain("type = 'shared'");

      // Reset for personal request
      vi.clearAllMocks();
      setupDefaultMocks({ periodTotal: 200, periodCount: 5 });
      const reqPersonal = createRequest({ validatedQuery: { context: 'personal' } });
      const resPersonal = createResponse();
      await handler(reqPersonal, resPersonal);

      // Check that the personal query uses type = 'personal' AND paid_by = ?
      const personalQuery = mockDb.all.mock.calls[0][0];
      expect(personalQuery).toContain("type = 'personal'");
      expect(personalQuery).toContain('paid_by = ?');
    });

    it('returns 500 on database error', async () => {
      mockDb.all.mockRejectedValueOnce(new Error('DB error'));
      const handler = getRouteHandler('/', 'get');
      const req = createRequest();
      const res = createResponse();

      await handler(req, res);

      expect(res.status).toHaveBeenCalledWith(500);
      expect(res.json).toHaveBeenCalledWith({ error: 'Error al obtener analíticas' });
    });
  });
});

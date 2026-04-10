import { beforeEach, describe, expect, it, vi } from 'vitest';

const mockDb = {
  all: vi.fn(),
  get: vi.fn(),
  run: vi.fn(),
};

vi.mock('../db.js', () => ({
  getDatabase: vi.fn(() => mockDb),
}));

import analyticsRouter from './analytics.js';

const getRouteHandler = (path: string, method: 'get' | 'post' | 'put' | 'delete') => {
  const layer = analyticsRouter.stack.find(
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

// Freeze current date for deterministic tests
const NOW = new Date('2026-03-15T12:00:00Z');

const createRequest = (overrides: any = {}): any => ({
  user: { id: 1, username: 'samuel', household_id: 1 },
  query: { months: '6', context: 'shared' },
  ...overrides,
});

describe('analytics routes', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.useFakeTimers();
    vi.setSystemTime(NOW);
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  const setupDefaultMocks = (overrides: {
    monthlyRows?: any[];
    currentMonthTotal?: number;
    currentMonthCount?: number;
    prevMonthTotal?: number;
    budget?: any;
    categoryRows?: any[];
    householdUser?: any;
    categoryColors?: any[];
    categoryBudgets?: any[];
  } = {}) => {
    const {
      monthlyRows = [],
      currentMonthTotal = 0,
      currentMonthCount = 0,
      prevMonthTotal = 0,
      budget = null,
      categoryRows = [],
      householdUser = { household_id: 1 },
      categoryColors = [],
      categoryBudgets = [],
    } = overrides;

    // Call order in the handler (analytics.ts):
    // 1. db.all  - monthly totals
    // 2. db.get  - current month total
    // 3. db.get  - current month count
    // 4. db.get  - prev month total
    // 5. db.get  - householdUser (app_users)
    // 6. db.get  - budget (household_budget)
    // 7. db.all  - category breakdown
    // 8. db.all  - category colors (if householdId)
    // 9. db.all  - category budgets (if householdId)
    // Then variable number of db.get calls for anomaly/streak insights

    mockDb.all
      .mockResolvedValueOnce(monthlyRows)       // 1. monthly totals
      .mockResolvedValueOnce(categoryRows)       // 7. category breakdown
      .mockResolvedValueOnce(categoryColors)     // 8. category colors
      .mockResolvedValueOnce(categoryBudgets);   // 9. category budgets

    mockDb.get
      .mockResolvedValueOnce({ total: currentMonthTotal })  // 2. current month total
      .mockResolvedValueOnce({ count: currentMonthCount })  // 3. current month count
      .mockResolvedValueOnce({ total: prevMonthTotal })     // 4. prev month total
      .mockResolvedValueOnce(householdUser)                 // 5. household user
      .mockResolvedValueOnce(budget);                       // 6. budget
  };

  describe('GET /', () => {
    it('returns monthly totals grouped correctly', async () => {
      const monthlyRows = [
        { month: '2025-10', total: 500 },
        { month: '2025-11', total: 700 },
        { month: '2025-12', total: 600 },
        { month: '2026-01', total: 800 },
        { month: '2026-02', total: 450 },
        { month: '2026-03', total: 350 },
      ];
      setupDefaultMocks({ monthlyRows });

      const handler = getRouteHandler('/', 'get');
      const req = createRequest();
      const res = createResponse();

      await handler(req, res);

      const response = res.json.mock.calls[0][0];
      expect(response.monthly).toEqual(monthlyRows);
      expect(response.monthly).toHaveLength(6);
    });

    it('calculates KPIs correctly (totalSpent, avgTicket, vsPrevPeriod)', async () => {
      setupDefaultMocks({
        currentMonthTotal: 600,
        currentMonthCount: 20,
        prevMonthTotal: 800,
        budget: { total_amount: 2000, personal_samuel: 500, personal_maria: 500 },
      });

      const handler = getRouteHandler('/', 'get');
      const req = createRequest();
      const res = createResponse();

      await handler(req, res);

      const { kpis } = res.json.mock.calls[0][0];
      expect(kpis.totalSpent).toBe(600);
      expect(kpis.avgTicket).toBe(30);
      expect(kpis.totalExpenses).toBe(20);
      // (600 - 800) / 800 * 100 = -25%
      expect(kpis.vsPrevPeriod).toBe(-25);
      // netSavings = shared_available - totalSpent = 2000 - 600 = 1400
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
        categoryColors: [
          { name: 'Restaurant', color: '#ff0000' },
          { name: 'Ocio', color: '#00ff00' },
        ],
      });

      const handler = getRouteHandler('/', 'get');
      const req = createRequest();
      const res = createResponse();

      await handler(req, res);

      const { categories } = res.json.mock.calls[0][0];
      expect(categories).toHaveLength(3);
      // Restaurant: 300/600 = 50%
      expect(categories[0]).toEqual({ name: 'Restaurant', amount: 300, pct: 50, color: '#ff0000' });
      // Ocio: 200/600 = 33%
      expect(categories[1]).toEqual({ name: 'Ocio', amount: 200, pct: 33, color: '#00ff00' });
      // Servicios: 100/600 = 17%, fallback color
      expect(categories[2]).toEqual({ name: 'Servicios', amount: 100, pct: 17, color: '#c4a0e8' });
    });

    it('generates positive trend insight when spending decreased', async () => {
      const categoryRows = [
        { name: 'Restaurant', amount: 400 },
      ];
      setupDefaultMocks({
        currentMonthTotal: 400,
        currentMonthCount: 10,
        prevMonthTotal: 600,
        categoryRows,
      });
      // Anomaly queries: for each category, db.get for historical avg
      mockDb.get.mockResolvedValueOnce({ total: 400 }); // historical avg for Restaurant (not anomalous)

      const handler = getRouteHandler('/', 'get');
      const req = createRequest();
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
        currentMonthTotal: 450,
        currentMonthCount: 15,
        prevMonthTotal: 450, // same, no positive trend
        categoryRows,
        categoryBudgets: [{ name: 'Restaurant', budget_amount: 500 }], // 450/500 = 90%
      });
      // Anomaly queries
      mockDb.get.mockResolvedValueOnce({ total: 450 }); // historical avg

      const handler = getRouteHandler('/', 'get');
      const req = createRequest();
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
      setupDefaultMocks({ currentMonthTotal: 1000, currentMonthCount: 30 });
      const handler = getRouteHandler('/', 'get');
      const reqShared = createRequest({ query: { months: '6', context: 'shared' } });
      const resShared = createResponse();
      await handler(reqShared, resShared);

      // Check that the shared query uses type = 'shared'
      const sharedQuery = mockDb.all.mock.calls[0][0];
      expect(sharedQuery).toContain("type = 'shared'");

      // Reset for personal request
      vi.clearAllMocks();
      setupDefaultMocks({ currentMonthTotal: 200, currentMonthCount: 5 });
      const reqPersonal = createRequest({ query: { months: '6', context: 'personal' } });
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
      expect(res.json).toHaveBeenCalledWith({ error: 'Failed to fetch analytics' });
    });
  });
});

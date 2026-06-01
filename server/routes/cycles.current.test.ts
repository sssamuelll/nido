import fs from 'fs/promises';
import os from 'os';
import path from 'path';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { createMockResponse, getRouteHandler } from '../../test/route-helpers';

// Integration test (real in-memory SQLite, no DB mock) for GET /api/cycles/current.
//
// Regression: when a household already has an ACTIVE cycle and one partner
// requests a restart, a second cycle is created with status='pending' while the
// old one stays 'active'. /current first-tried the active cycle and only fell
// back to pending when NO active existed, so the pending restart was invisible
// to the partner — Settings.tsx never reached the "Aprobar reinicio" button.
// The fix surfaces the pending cycle as `pending_restart` alongside the active
// one (mirroring how household-budget exposes `pending_approval`).

describe('GET /api/cycles/current — pending restart surfacing (real DB)', () => {
  let tempDir: string;
  let dbModule: typeof import('../db.js');
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  let cyclesRouter: any;
  let householdId: number;
  let samuelId: number;
  let mariaId: number;

  beforeEach(async () => {
    vi.resetModules();
    vi.stubEnv('NODE_ENV', 'test');
    tempDir = await fs.mkdtemp(path.join(os.tmpdir(), 'nido-cycles-cur-'));
    vi.stubEnv('DATABASE_URL', path.join(tempDir, 'nido.test.db'));

    dbModule = await import('../db.js');
    await dbModule.initDatabase();
    cyclesRouter = (await import('./cycles.js')).default;

    const db = dbModule.getDatabase();
    householdId = (await db.get<{ id: number }>(`SELECT id FROM households LIMIT 1`))!.id;
    mariaId = (await db.get<{ id: number }>(`SELECT id FROM app_users WHERE username = 'maria'`))!.id;
    samuelId = (await db.get<{ id: number }>(`SELECT id FROM app_users WHERE username = 'samuel'`))!.id;
  });

  afterEach(async () => {
    await dbModule.closeDatabase();
    vi.unstubAllEnvs();
    await fs.rm(tempDir, { recursive: true, force: true });
  });

  const callCurrent = async (userId: number) => {
    const handler = getRouteHandler(cyclesRouter, '/current', 'get');
    const req = {
      user: { id: userId, username: userId === mariaId ? 'maria' : 'samuel' },
      log: { error: vi.fn() },
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
    } as any;
    const res = createMockResponse();
    await handler(req, res);
    return res.json.mock.calls[0][0];
  };

  const seedActiveCycle = async () => {
    const db = dbModule.getDatabase();
    const r = await db.run(
      `INSERT INTO billing_cycles (household_id, month, requested_by_user_id, status, started_at, start_date)
       VALUES (?, '2026-04-27', ?, 'active', '2026-04-27 10:00:00', '2026-04-27')`,
      householdId,
      mariaId,
    );
    return r.lastID!;
  };

  // Maria requests a restart: new pending cycle + her own auto-approval row.
  const seedPendingRestartByMaria = async () => {
    const db = dbModule.getDatabase();
    const r = await db.run(
      `INSERT INTO billing_cycles (household_id, month, requested_by_user_id, status)
       VALUES (?, '2026-05-30', ?, 'pending')`,
      householdId,
      mariaId,
    );
    await db.run(
      `INSERT INTO billing_cycle_approvals (cycle_id, user_id, status) VALUES (?, ?, 'approved')`,
      r.lastID,
      mariaId,
    );
    return r.lastID!;
  };

  it('keeps the active cycle current AND surfaces pending_restart to the non-requester (Samuel)', async () => {
    const activeId = await seedActiveCycle();
    const pendingId = await seedPendingRestartByMaria();

    const body = await callCurrent(samuelId);

    // Dashboard / AddExpense rely on /current being the active, started cycle.
    expect(body.id).toBe(activeId);
    expect(body.status).toBe('active');
    expect(body.start_date).toBe('2026-04-27');

    // The shadowed restart must now be reachable so Samuel can approve it.
    expect(body.pending_restart).toBeTruthy();
    expect(body.pending_restart.id).toBe(pendingId);
    expect(body.pending_restart.requested_by_user_id).toBe(mariaId);
    expect(body.pending_restart.requested_by_username).toBe('maria');
    expect(body.pending_restart.approvals.current_user_has_approved).toBe(false);
    expect(body.pending_restart.approvals.all_approved).toBe(false);
  });

  it('marks pending_restart as already approved for the requester (Maria)', async () => {
    await seedActiveCycle();
    const pendingId = await seedPendingRestartByMaria();

    const body = await callCurrent(mariaId);

    expect(body.status).toBe('active');
    expect(body.pending_restart.id).toBe(pendingId);
    expect(body.pending_restart.approvals.current_user_has_approved).toBe(true);
  });

  it('returns pending_restart = null when only an active cycle exists', async () => {
    const activeId = await seedActiveCycle();

    const body = await callCurrent(samuelId);

    expect(body.id).toBe(activeId);
    expect(body.status).toBe('active');
    expect(body.pending_restart).toBeNull();
  });

  it('bootstrap: no active cycle, one pending → returns the pending cycle at top level', async () => {
    const pendingId = await seedPendingRestartByMaria();

    const body = await callCurrent(samuelId);

    expect(body.id).toBe(pendingId);
    expect(body.status).toBe('pending');
    expect(body.pending_restart).toBeNull();
  });
});

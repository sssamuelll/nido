import { Router } from 'express';
import { getDatabase, createNotification, notifyPartner } from '../db.js';
import { AuthRequest } from '../auth.js';
import { validate, cycleApproveSchema, CycleApproveInput } from '../validation.js';
import { format } from 'date-fns';

interface RecurringExpenseRow {
  id: number;
  household_id: number;
  name: string;
  emoji: string;
  amount: number;
  category: string;
  category_id: number | null;
  type: string;
  notes: string | null;
  every_n_cycles: number;
  last_registered_cycle_id: number | null;
  paused: number;
  created_by_user_id: number;
}

const router = Router();

const getCycleWithApprovalState = async (db: ReturnType<typeof getDatabase>, cycleId: number, currentUserId: number) => {
  const cycle = await db.get<any>(
    `SELECT bc.*, requester.username AS requested_by_username
     FROM billing_cycles bc
     LEFT JOIN app_users requester ON requester.id = bc.requested_by_user_id
     WHERE bc.id = ?`,
    cycleId
  );

  if (!cycle) return null;

  const memberRow = await db.get<{ total_members: number }>(
    `SELECT COUNT(*) as total_members FROM app_users WHERE household_id = ?`,
    cycle.household_id
  );

  const approvalRows = await db.all<{ user_id: number }[]>(
    `SELECT user_id FROM billing_cycle_approvals WHERE cycle_id = ?`,
    cycleId
  );

  const approvedUserIds = approvalRows.map((row) => row.user_id);

  // Compute end_date from the next cycle's start_date
  const nextCycle = await db.get<{ start_date: string }>(
    `SELECT start_date FROM billing_cycles
     WHERE household_id = ? AND start_date > COALESCE(?, '0000-00-00') AND id != ?
     ORDER BY start_date ASC LIMIT 1`,
    cycle.household_id,
    cycle.start_date,
    cycleId
  );

  return {
    ...cycle,
    end_date: nextCycle?.start_date ?? null,
    approvals: {
      total_members: memberRow?.total_members ?? 0,
      approved_count: approvedUserIds.length,
      approved_user_ids: approvedUserIds,
      current_user_has_approved: approvedUserIds.includes(currentUserId),
      all_approved: (memberRow?.total_members ?? 0) > 0 && approvedUserIds.length >= (memberRow?.total_members ?? 0),
    },
  };
};

const activateCycle = async (db: ReturnType<typeof getDatabase>, cycleId: number, householdId: number, actingUserId: number) => {
  const today = format(new Date(), 'yyyy-MM-dd');

  const recurringItems = await db.all<RecurringExpenseRow[]>(
    `SELECT re.*, au.username as creator_username FROM recurring_expenses re
     LEFT JOIN app_users au ON au.id = re.created_by_user_id
     WHERE re.household_id = ? AND re.paused = 0`,
    householdId
  );

  let total = 0;
  let registeredCount = 0;

  for (const item of recurringItems) {
    // Check cycle frequency — skip items that shouldn't fire this cycle
    if (item.every_n_cycles > 1) {
      if (item.last_registered_cycle_id) {
        const countRow = await db.get<{ cnt: number }>(
          `SELECT COUNT(*) as cnt FROM billing_cycles WHERE household_id = ? AND id > ? AND status = 'active'`,
          householdId,
          item.last_registered_cycle_id
        );
        // +1 because the current cycle (being activated now) is not yet 'active'
        if ((countRow?.cnt ?? 0) + 1 < item.every_n_cycles) {
          continue; // Not enough cycles elapsed — skip
        }
      }
      // If no last_registered_cycle_id, this is the first time — register it
    }

    const paidBy = (item as any).creator_username || 'unknown';

    await db.run(
      `INSERT INTO expenses (description, amount, category, category_id, date, paid_by, paid_by_user_id, type, status)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, 'paid')`,
      item.name,
      item.amount,
      item.category,
      item.category_id,
      today,
      paidBy,
      item.created_by_user_id,
      item.type
    );

    // Track which cycle this recurring expense was last registered in
    await db.run(
      `UPDATE recurring_expenses SET last_registered_cycle_id = ? WHERE id = ?`,
      cycleId,
      item.id
    );

    total += item.amount;
    registeredCount++;
  }

  await db.run(
    `UPDATE billing_cycles
     SET status = 'active', approved_by_user_id = ?, started_at = CURRENT_TIMESTAMP, start_date = ?
     WHERE id = ?`,
    actingUserId,
    today,
    cycleId
  );

  // Snapshot category budgets for this cycle
  await db.run(
    `INSERT OR IGNORE INTO category_budget_snapshots (cycle_id, category_id, budget_amount)
     SELECT ?, id, budget_amount FROM categories WHERE household_id = ?`,
    cycleId,
    householdId
  );

  // Snapshot household budget for this cycle
  await db.run(
    `INSERT OR IGNORE INTO household_budget_snapshots (cycle_id, total_amount, personal_samuel, personal_maria)
     SELECT ?, total_amount, personal_samuel, personal_maria FROM household_budget WHERE household_id = ?`,
    cycleId,
    householdId
  );

  await createNotification({
    household_id: String(householdId),
    recipient_user_id: null,
    type: 'cycle_approved',
    title: 'Ciclo reiniciado',
    body: `Se registraron ${registeredCount} gastos recurrentes por un total de €${total.toFixed(2)}`,
    metadata: { cycle_id: cycleId, count: registeredCount, total },
  });
};

// List all billing cycles for the household
router.get('/list', async (req: AuthRequest, res) => {
  try {
    const db = getDatabase();
    const user = await db.get<{ household_id: number }>('SELECT household_id FROM app_users WHERE id = ?', req.user!.id);
    if (!user) return res.status(404).json({ error: 'Usuario no encontrado' });

    const cycles = await db.all<Array<{ id: number; month: string; status: string; start_date: string | null; started_at: string | null; created_at: string }>>(
      `SELECT id, month, status, start_date, started_at, created_at FROM billing_cycles
       WHERE household_id = ? ORDER BY COALESCE(start_date, created_at) DESC`,
      user.household_id
    );

    // Compute end_date for each cycle (start_date of next newer cycle)
    const result = cycles.map((cycle, index) => ({
      ...cycle,
      end_date: index > 0 ? cycles[index - 1].start_date : null,
    }));

    res.json(result);
  } catch (error) {
    console.error('Error listing cycles:', error);
    res.status(500).json({ error: 'Error al listar ciclos' });
  }
});

// Get the active billing cycle (most recent active, regardless of calendar month)
router.get('/current', async (req: AuthRequest, res) => {
  try {
    const db = getDatabase();
    const user = await db.get<{ household_id: number }>(
      'SELECT household_id FROM app_users WHERE id = ?',
      req.user!.id
    );

    if (!user) {
      return res.status(404).json({ error: 'Usuario no encontrado' });
    }

    // First try: most recent active cycle
    let cycle = await db.get<{ id: number }>(
      `SELECT id FROM billing_cycles
       WHERE household_id = ? AND status = 'active'
       ORDER BY COALESCE(start_date, created_at) DESC LIMIT 1`,
      user.household_id
    );

    // Second try: any pending cycle
    if (!cycle) {
      cycle = await db.get<{ id: number }>(
        `SELECT id FROM billing_cycles
         WHERE household_id = ? AND status = 'pending'
         ORDER BY created_at DESC LIMIT 1`,
        user.household_id
      );
    }

    if (!cycle) {
      return res.json(null);
    }

    const detailedCycle = await getCycleWithApprovalState(db, cycle.id, req.user!.id);
    res.json(detailedCycle);
  } catch (error) {
    console.error('Error fetching current billing cycle:', error);
    res.status(500).json({ error: 'Error al obtener ciclo de facturación actual' });
  }
});

// Request a new billing cycle
router.post('/request', async (req: AuthRequest, res) => {
  try {
    const db = getDatabase();
    const user = await db.get<{ household_id: number }>(
      'SELECT household_id FROM app_users WHERE id = ?',
      req.user!.id
    );

    if (!user) {
      return res.status(404).json({ error: 'Usuario no encontrado' });
    }

    // Check if there's already a pending cycle
    const pendingCycle = await db.get<{ id: number }>(
      `SELECT id FROM billing_cycles
       WHERE household_id = ? AND status = 'pending'
       ORDER BY created_at DESC LIMIT 1`,
      user.household_id
    );

    if (pendingCycle) {
      const detailedExisting = await getCycleWithApprovalState(db, pendingCycle.id, req.user!.id);
      return res.status(200).json(detailedExisting);
    }

    // Use a unique label for the month column (date-based to avoid UNIQUE conflicts)
    const cycleLabel = format(new Date(), 'yyyy-MM-dd');

    const result = await db.run(
      `INSERT INTO billing_cycles (household_id, month, requested_by_user_id)
       VALUES (?, ?, ?)`,
      user.household_id,
      cycleLabel,
      req.user!.id
    );

    await db.run(
      `INSERT INTO billing_cycle_approvals (cycle_id, user_id, status)
       VALUES (?, ?, 'approved')`,
      result.lastID,
      req.user!.id
    );

    await notifyPartner(
      req.user!.id,
      req.user!.username,
      'cycle_requested',
      'Reinicio de ciclo solicitado',
      `{name} solicitó reiniciar el ciclo`,
      { cycle_id: result.lastID }
    );

    const cycle = await getCycleWithApprovalState(db, result.lastID!, req.user!.id);
    res.status(201).json(cycle);
  } catch (error) {
    console.error('Error requesting billing cycle:', error);
    res.status(500).json({ error: 'Error al solicitar ciclo de facturación' });
  }
});

// Approve a pending billing cycle
router.post('/approve', validate(cycleApproveSchema), async (req: AuthRequest, res) => {
  const { cycle_id } =
    (req as AuthRequest & { validatedData: CycleApproveInput }).validatedData;

  try {
    const db = getDatabase();
    const user = await db.get<{ household_id: number }>(
      'SELECT household_id FROM app_users WHERE id = ?',
      req.user!.id
    );

    if (!user) {
      return res.status(404).json({ error: 'Usuario no encontrado' });
    }

    const cycle = await db.get<{ id: number; household_id: number; requested_by_user_id: number; status: string }>(
      'SELECT * FROM billing_cycles WHERE id = ? AND household_id = ?',
      cycle_id,
      user.household_id
    );

    if (!cycle) {
      return res.status(404).json({ error: 'Ciclo de facturación no encontrado' });
    }

    if (cycle.status !== 'pending') {
      return res.status(400).json({ error: 'El ciclo de facturación no está pendiente' });
    }

    await db.run(
      `INSERT OR IGNORE INTO billing_cycle_approvals (cycle_id, user_id, status)
       VALUES (?, ?, 'approved')`,
      cycle_id,
      req.user!.id
    );

    const detailedCycle = await getCycleWithApprovalState(db, cycle_id, req.user!.id);

    if (!detailedCycle) {
      return res.status(404).json({ error: 'Ciclo de facturación no encontrado' });
    }

    if (detailedCycle.approvals.all_approved) {
      await activateCycle(db, cycle_id, user.household_id, req.user!.id);
      const activeCycle = await getCycleWithApprovalState(db, cycle_id, req.user!.id);
      return res.json(activeCycle);
    }

    res.json(detailedCycle);
  } catch (error) {
    console.error('Error approving billing cycle:', error);
    res.status(500).json({ error: 'Error al aprobar ciclo de facturación' });
  }
});

export default router;

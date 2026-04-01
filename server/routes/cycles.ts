import { Router } from 'express';
import { getDatabase, createNotification, notifyPartner } from '../db.js';
import { AuthRequest } from '../auth.js';
import { format } from 'date-fns';

interface RecurringExpenseRow {
  id: number;
  household_id: number;
  name: string;
  emoji: string;
  amount: number;
  category: string;
  type: string;
  notes: string | null;
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
    `SELECT * FROM recurring_expenses
     WHERE household_id = ? AND paused = 0`,
    householdId
  );

  let total = 0;

  for (const item of recurringItems) {
    const creator = await db.get<{ username: string }>(
      'SELECT username FROM app_users WHERE id = ?',
      item.created_by_user_id
    );
    const paidBy = creator?.username || 'samuel';

    await db.run(
      `INSERT INTO expenses (description, amount, category, date, paid_by, paid_by_user_id, type, status)
       VALUES (?, ?, ?, ?, ?, ?, ?, 'paid')`,
      item.name,
      item.amount,
      item.category,
      today,
      paidBy,
      item.created_by_user_id,
      item.type
    );

    total += item.amount;
  }

  await db.run(
    `UPDATE billing_cycles
     SET status = 'active', approved_by_user_id = ?, started_at = CURRENT_TIMESTAMP, start_date = ?
     WHERE id = ?`,
    actingUserId,
    today,
    cycleId
  );

  await createNotification({
    household_id: String(householdId),
    recipient_user_id: null,
    type: 'cycle_approved',
    title: 'Ciclo reiniciado',
    body: `Se registraron ${recurringItems.length} gastos recurrentes por un total de €${total.toFixed(2)}`,
    metadata: { cycle_id: cycleId, count: recurringItems.length, total },
  });
};

// Get the active billing cycle (most recent active, regardless of calendar month)
router.get('/current', async (req: AuthRequest, res) => {
  try {
    const db = getDatabase();
    const user = await db.get<{ household_id: number }>(
      'SELECT household_id FROM app_users WHERE id = ?',
      req.user!.id
    );

    if (!user) {
      return res.status(404).json({ error: 'User not found' });
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
    res.status(500).json({ error: 'Failed to fetch current billing cycle' });
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
      return res.status(404).json({ error: 'User not found' });
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
    res.status(500).json({ error: 'Failed to request billing cycle' });
  }
});

// Approve a pending billing cycle
router.post('/approve', async (req: AuthRequest, res) => {
  const { cycle_id } = req.body;

  if (!cycle_id) {
    return res.status(400).json({ error: 'cycle_id is required' });
  }

  try {
    const db = getDatabase();
    const user = await db.get<{ household_id: number }>(
      'SELECT household_id FROM app_users WHERE id = ?',
      req.user!.id
    );

    if (!user) {
      return res.status(404).json({ error: 'User not found' });
    }

    const cycle = await db.get<{ id: number; household_id: number; requested_by_user_id: number; status: string }>(
      'SELECT * FROM billing_cycles WHERE id = ? AND household_id = ?',
      cycle_id,
      user.household_id
    );

    if (!cycle) {
      return res.status(404).json({ error: 'Billing cycle not found' });
    }

    if (cycle.status !== 'pending') {
      return res.status(400).json({ error: 'Billing cycle is not pending' });
    }

    await db.run(
      `INSERT OR IGNORE INTO billing_cycle_approvals (cycle_id, user_id, status)
       VALUES (?, ?, 'approved')`,
      cycle_id,
      req.user!.id
    );

    const detailedCycle = await getCycleWithApprovalState(db, cycle_id, req.user!.id);

    if (!detailedCycle) {
      return res.status(404).json({ error: 'Billing cycle not found' });
    }

    if (detailedCycle.approvals.all_approved) {
      await activateCycle(db, cycle_id, user.household_id, req.user!.id);
      const activeCycle = await getCycleWithApprovalState(db, cycle_id, req.user!.id);
      return res.json(activeCycle);
    }

    res.json(detailedCycle);
  } catch (error) {
    console.error('Error approving billing cycle:', error);
    res.status(500).json({ error: 'Failed to approve billing cycle' });
  }
});

export default router;

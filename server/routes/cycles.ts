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

  return {
    ...cycle,
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
  const recurringItems = await db.all<RecurringExpenseRow[]>(
    `SELECT * FROM recurring_expenses
     WHERE household_id = ? AND paused = 0`,
    householdId
  );

  const today = format(new Date(), 'yyyy-MM-dd');
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
     SET status = 'active', approved_by_user_id = ?, started_at = CURRENT_TIMESTAMP
     WHERE id = ?`,
    actingUserId,
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

// Get current month's billing cycle
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

    const month = format(new Date(), 'yyyy-MM');
    const cycle = await db.get<{ id: number }>(
      'SELECT id FROM billing_cycles WHERE household_id = ? AND month = ?',
      user.household_id,
      month
    );

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

// Request a new billing cycle for the current month
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

    const month = format(new Date(), 'yyyy-MM');
    const existing = await db.get<{ id: number; status: string }>(
      'SELECT id, status FROM billing_cycles WHERE household_id = ? AND month = ?',
      user.household_id,
      month
    );

    if (existing) {
      if (existing.status === 'pending') {
        const detailedExisting = await getCycleWithApprovalState(db, existing.id, req.user!.id);
        return res.status(200).json(detailedExisting);
      }
      return res.status(409).json({ error: 'A billing cycle already exists for this month' });
    }

    const result = await db.run(
      `INSERT INTO billing_cycles (household_id, month, requested_by_user_id)
       VALUES (?, ?, ?)`,
      user.household_id,
      month,
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
      `{name} solicitó reiniciar el ciclo de ${month}`,
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

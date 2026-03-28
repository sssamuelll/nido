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
    const cycle = await db.get(
      'SELECT * FROM billing_cycles WHERE household_id = ? AND month = ?',
      user.household_id,
      month
    );

    res.json(cycle || null);
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

    const existing = await db.get(
      'SELECT * FROM billing_cycles WHERE household_id = ? AND month = ?',
      user.household_id,
      month
    );

    if (existing) {
      return res.status(409).json({ error: 'A billing cycle already exists for this month' });
    }

    const result = await db.run(
      `INSERT INTO billing_cycles (household_id, month, requested_by_user_id)
       VALUES (?, ?, ?)`,
      user.household_id,
      month,
      req.user!.id
    );

    const cycle = await db.get('SELECT * FROM billing_cycles WHERE id = ?', result.lastID);

    await notifyPartner(req.user!.id, req.user!.username, 'cycle_requested', 'Ciclo de facturación',
      `{name} solicitó iniciar el ciclo de ${month}`, { cycle_id: result.lastID });

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

    // Requester cannot self-approve
    if (cycle.requested_by_user_id === req.user!.id) {
      return res.status(403).json({ error: 'You cannot approve your own billing cycle request' });
    }

    // Get all non-paused recurring expenses for the household
    const recurringItems = await db.all<RecurringExpenseRow[]>(
      `SELECT * FROM recurring_expenses
       WHERE household_id = ? AND paused = 0`,
      user.household_id
    );

    const today = format(new Date(), 'yyyy-MM-dd');
    let total = 0;

    // Insert each recurring expense as an actual expense
    for (const item of recurringItems) {
      const creator = await db.get<{ username: string }>(
        'SELECT username FROM app_users WHERE id = ?',
        item.created_by_user_id
      );
      const paidBy = creator?.username || req.user!.username;

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

    // Update cycle status
    await db.run(
      `UPDATE billing_cycles SET status = 'active', approved_by_user_id = ?, started_at = CURRENT_TIMESTAMP WHERE id = ?`,
      req.user!.id,
      cycle_id
    );

    const updatedCycle = await db.get('SELECT * FROM billing_cycles WHERE id = ?', cycle_id);

    // Broadcast notification to both users
    await createNotification({
      household_id: String(user.household_id),
      recipient_user_id: null,
      type: 'cycle_approved',
      title: 'Ciclo de facturación activado',
      body: `Se registraron ${recurringItems.length} gastos recurrentes por un total de €${total.toFixed(2)}`,
      metadata: { cycle_id, count: recurringItems.length, total },
    });

    res.json(updatedCycle);
  } catch (error) {
    console.error('Error approving billing cycle:', error);
    res.status(500).json({ error: 'Failed to approve billing cycle' });
  }
});

export default router;

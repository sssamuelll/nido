import { Router } from 'express';
import { getDatabase, notifyPartner } from '../db.js';
import { AuthRequest } from '../auth.js';
import {
  recurringExpenseCreateSchema,
  recurringExpenseUpdateSchema,
  validate,
  RecurringExpenseInput,
  RecurringExpenseUpdateInput,
} from '../validation.js';

const router = Router();

// List recurring expenses for household (shared visible to both, personal only to creator)
router.get('/', async (req: AuthRequest, res) => {
  try {
    const db = getDatabase();
    const user = await db.get<{ household_id: number }>(
      'SELECT household_id FROM app_users WHERE id = ?',
      req.user!.id
    );

    if (!user) {
      return res.status(404).json({ error: 'User not found' });
    }

    const items = await db.all(
      `SELECT * FROM recurring_expenses
       WHERE household_id = ?
         AND (type = 'shared' OR created_by_user_id = ?)
       ORDER BY created_at`,
      user.household_id,
      req.user!.id
    );

    res.json(items);
  } catch (error) {
    console.error('Error fetching recurring expenses:', error);
    res.status(500).json({ error: 'Failed to fetch recurring expenses' });
  }
});

// Create recurring expense
router.post('/', validate(recurringExpenseCreateSchema), async (req: AuthRequest, res) => {
  const { name, emoji, amount, category, type, notes } = req.validatedData as RecurringExpenseInput;

  try {
    const db = getDatabase();
    const user = await db.get<{ household_id: number }>(
      'SELECT household_id FROM app_users WHERE id = ?',
      req.user!.id
    );

    if (!user) {
      return res.status(404).json({ error: 'User not found' });
    }

    const result = await db.run(
      `INSERT INTO recurring_expenses (household_id, name, emoji, amount, category, type, notes, created_by_user_id)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
      user.household_id,
      name,
      emoji,
      amount,
      category,
      type,
      notes || null,
      req.user!.id
    );

    const newItem = await db.get('SELECT * FROM recurring_expenses WHERE id = ?', result.lastID);

    if (type === 'shared') {
      await notifyPartner(req.user!.id, req.user!.username, 'recurring_created', 'Nuevo gasto recurrente',
        `{name} creó "${name}" (€${amount}/mes)`, { recurring_id: result.lastID });
    }

    res.status(201).json(newItem);
  } catch (error) {
    console.error('Error creating recurring expense:', error);
    res.status(500).json({ error: 'Failed to create recurring expense' });
  }
});

// Update recurring expense
router.put('/:id', validate(recurringExpenseUpdateSchema), async (req: AuthRequest, res) => {
  const { id } = req.params;
  const data = req.validatedData as RecurringExpenseUpdateInput;

  try {
    const db = getDatabase();
    const user = await db.get<{ household_id: number }>(
      'SELECT household_id FROM app_users WHERE id = ?',
      req.user!.id
    );

    if (!user) {
      return res.status(404).json({ error: 'User not found' });
    }

    const existing = await db.get(
      'SELECT * FROM recurring_expenses WHERE id = ? AND household_id = ?',
      id,
      user.household_id
    );

    if (!existing) {
      return res.status(404).json({ error: 'Recurring expense not found' });
    }

    await db.run(
      `UPDATE recurring_expenses SET
        name = COALESCE(?, name),
        emoji = COALESCE(?, emoji),
        amount = COALESCE(?, amount),
        category = COALESCE(?, category),
        type = COALESCE(?, type),
        notes = CASE WHEN ?1 = 1 THEN ?2 ELSE notes END
      WHERE id = ?`,
      data.name,
      data.emoji,
      data.amount,
      data.category,
      data.type,
      data.notes !== undefined ? 1 : 0,
      data.notes !== undefined ? (data.notes ?? null) : null,
      id
    );

    const updated = await db.get('SELECT * FROM recurring_expenses WHERE id = ?', id);
    res.json(updated);
  } catch (error) {
    console.error('Error updating recurring expense:', error);
    res.status(500).json({ error: 'Failed to update recurring expense' });
  }
});

// Delete recurring expense
router.delete('/:id', async (req: AuthRequest, res) => {
  const { id } = req.params;

  try {
    const db = getDatabase();
    const user = await db.get<{ household_id: number }>(
      'SELECT household_id FROM app_users WHERE id = ?',
      req.user!.id
    );

    if (!user) {
      return res.status(404).json({ error: 'User not found' });
    }

    const existing = await db.get(
      'SELECT * FROM recurring_expenses WHERE id = ? AND household_id = ?',
      id,
      user.household_id
    );

    if (!existing) {
      return res.status(404).json({ error: 'Recurring expense not found' });
    }

    if (existing.type === 'shared') {
      await notifyPartner(req.user!.id, req.user!.username, 'recurring_deleted', 'Gasto recurrente eliminado',
        `{name} eliminó "${existing.name}" (€${existing.amount}/mes)`, { recurring_id: Number(id) });
    }

    await db.run('DELETE FROM recurring_expenses WHERE id = ?', id);
    res.status(204).send();
  } catch (error) {
    console.error('Error deleting recurring expense:', error);
    res.status(500).json({ error: 'Failed to delete recurring expense' });
  }
});

// Toggle paused status
router.put('/:id/pause', async (req: AuthRequest, res) => {
  const { id } = req.params;

  try {
    const db = getDatabase();
    const user = await db.get<{ household_id: number }>(
      'SELECT household_id FROM app_users WHERE id = ?',
      req.user!.id
    );

    if (!user) {
      return res.status(404).json({ error: 'User not found' });
    }

    const existing = await db.get<{ id: number; household_id: number; name: string; amount: number; type: string; paused: number }>(
      'SELECT * FROM recurring_expenses WHERE id = ? AND household_id = ?',
      id,
      user.household_id
    );

    if (!existing) {
      return res.status(404).json({ error: 'Recurring expense not found' });
    }

    const newPaused = existing.paused ? 0 : 1;
    await db.run('UPDATE recurring_expenses SET paused = ? WHERE id = ?', newPaused, id);

    if (existing.type === 'shared') {
      const notifType = newPaused ? 'recurring_paused' : 'recurring_resumed';
      const action = newPaused ? 'pausó' : 'reanudó';
      await notifyPartner(req.user!.id, req.user!.username, notifType,
        newPaused ? 'Gasto recurrente pausado' : 'Gasto recurrente reanudado',
        `{name} ${action} "${existing.name}" (€${existing.amount}/mes)`, { recurring_id: Number(id) });
    }

    const updated = await db.get('SELECT * FROM recurring_expenses WHERE id = ?', id);
    res.json(updated);
  } catch (error) {
    console.error('Error toggling recurring expense pause:', error);
    res.status(500).json({ error: 'Failed to toggle pause status' });
  }
});

export default router;

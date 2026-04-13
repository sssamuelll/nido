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
      return res.status(404).json({ error: 'Usuario no encontrado' });
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
    res.status(500).json({ error: 'Error al obtener gastos recurrentes' });
  }
});

// Create recurring expense
router.post('/', validate(recurringExpenseCreateSchema), async (req: AuthRequest, res) => {
  const data = req.validatedData as RecurringExpenseInput;
  const { name, emoji, amount, type, notes, every_n_cycles } = data;

  try {
    const db = getDatabase();
    const user = await db.get<{ household_id: number }>(
      'SELECT household_id FROM app_users WHERE id = ?',
      req.user!.id
    );

    if (!user) {
      return res.status(404).json({ error: 'Usuario no encontrado' });
    }

    // Resolve category_id
    let categoryId: number | null = data.category_id ?? null;
    let categoryName: string = data.category ?? '';

    if (categoryId && !categoryName) {
      const catRow = await db.get<{ name: string }>('SELECT name FROM categories WHERE id = ?', categoryId);
      categoryName = catRow?.name ?? '';
    } else if (categoryName && !categoryId) {
      if (type === 'shared') {
        const row = await db.get<{ id: number }>(
          `SELECT id FROM categories WHERE name = ? AND context = 'shared' AND owner_user_id IS NULL AND household_id = ?`,
          categoryName, user.household_id
        );
        categoryId = row?.id ?? null;
      } else {
        const row = await db.get<{ id: number }>(
          `SELECT id FROM categories WHERE name = ? AND context = 'personal' AND owner_user_id = ? AND household_id = ?`,
          categoryName, req.user!.id, user.household_id
        );
        categoryId = row?.id ?? null;
      }
    }

    const result = await db.run(
      `INSERT INTO recurring_expenses (household_id, name, emoji, amount, category, category_id, type, notes, every_n_cycles, created_by_user_id)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      user.household_id,
      name,
      emoji,
      amount,
      categoryName,
      categoryId,
      type,
      notes || null,
      every_n_cycles,
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
    res.status(500).json({ error: 'Error al crear gasto recurrente' });
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
      return res.status(404).json({ error: 'Usuario no encontrado' });
    }

    const existing = await db.get(
      'SELECT * FROM recurring_expenses WHERE id = ? AND household_id = ?',
      id,
      user.household_id
    );

    if (!existing) {
      return res.status(404).json({ error: 'Gasto recurrente no encontrado' });
    }

    // Resolve category_id if category name provided without id
    let categoryId: number | null | undefined = data.category_id;
    if (data.category && !data.category_id) {
      const effectiveType = data.type ?? (existing as Record<string, unknown>).type as string;
      if (effectiveType === 'shared') {
        const row = await db.get<{ id: number }>(
          `SELECT id FROM categories WHERE name = ? AND context = 'shared' AND owner_user_id IS NULL AND household_id = ?`,
          data.category, user.household_id
        );
        categoryId = row?.id ?? null;
      } else {
        const row = await db.get<{ id: number }>(
          `SELECT id FROM categories WHERE name = ? AND context = 'personal' AND owner_user_id = ? AND household_id = ?`,
          data.category, req.user!.id, user.household_id
        );
        categoryId = row?.id ?? null;
      }
    }

    await db.run(
      `UPDATE recurring_expenses SET
        name = COALESCE(?, name),
        emoji = COALESCE(?, emoji),
        amount = COALESCE(?, amount),
        category = COALESCE(?, category),
        category_id = COALESCE(?, category_id),
        type = COALESCE(?, type),
        notes = CASE WHEN ?1 = 1 THEN ?2 ELSE notes END,
        every_n_cycles = COALESCE(?, every_n_cycles)
      WHERE id = ?`,
      data.name,
      data.emoji,
      data.amount,
      data.category,
      categoryId ?? null,
      data.type,
      data.notes !== undefined ? 1 : 0,
      data.notes !== undefined ? (data.notes ?? null) : null,
      data.every_n_cycles ?? null,
      id
    );

    const updated = await db.get('SELECT * FROM recurring_expenses WHERE id = ?', id);
    res.json(updated);
  } catch (error) {
    console.error('Error updating recurring expense:', error);
    res.status(500).json({ error: 'Error al actualizar gasto recurrente' });
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
      return res.status(404).json({ error: 'Usuario no encontrado' });
    }

    const existing = await db.get(
      'SELECT * FROM recurring_expenses WHERE id = ? AND household_id = ?',
      id,
      user.household_id
    );

    if (!existing) {
      return res.status(404).json({ error: 'Gasto recurrente no encontrado' });
    }

    if (existing.type === 'shared') {
      await notifyPartner(req.user!.id, req.user!.username, 'recurring_deleted', 'Gasto recurrente eliminado',
        `{name} eliminó "${existing.name}" (€${existing.amount}/mes)`, { recurring_id: Number(id) });
    }

    await db.run('DELETE FROM recurring_expenses WHERE id = ?', id);
    res.status(204).send();
  } catch (error) {
    console.error('Error deleting recurring expense:', error);
    res.status(500).json({ error: 'Error al eliminar gasto recurrente' });
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
      return res.status(404).json({ error: 'Usuario no encontrado' });
    }

    const existing = await db.get<{ id: number; household_id: number; name: string; amount: number; type: string; paused: number }>(
      'SELECT * FROM recurring_expenses WHERE id = ? AND household_id = ?',
      id,
      user.household_id
    );

    if (!existing) {
      return res.status(404).json({ error: 'Gasto recurrente no encontrado' });
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
    res.status(500).json({ error: 'Error al cambiar estado de pausa' });
  }
});

export default router;

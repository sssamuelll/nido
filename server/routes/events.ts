import { Router } from 'express';
import { getDatabase } from '../db.js';
import { AuthRequest } from '../auth.js';
import {
  validate,
  eventCreateSchema,
  eventUpdateSchema,
  EventCreateInput,
  EventUpdateInput,
} from '../validation.js';

const router = Router();

// GET / — List events for household filtered by context
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

    const context = (req.query.context as string) === 'personal' ? 'personal' : 'shared';

    const events = await db.all(
      `SELECT e.*,
              COALESCE(SUM(ex.amount), 0) AS total_spent
       FROM events e
       LEFT JOIN expenses ex ON ex.event_id = e.id
       WHERE e.household_id = ?
         AND (
           e.context = 'shared'
           OR (e.context = 'personal' AND e.owner_user_id = ?)
         )
         AND e.context = ?
       GROUP BY e.id
       ORDER BY
         CASE WHEN e.end_date >= date('now') THEN 0 ELSE 1 END ASC,
         e.end_date ASC`,
      user.household_id,
      req.user!.id,
      context
    );

    res.json(events);
  } catch (error) {
    console.error('Error fetching events:', error);
    res.status(500).json({ error: 'Error al obtener eventos' });
  }
});

// GET /:id — Full event detail with KPIs, category breakdown, and expenses
router.get('/:id', async (req: AuthRequest, res) => {
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

    const event = await db.get(
      `SELECT * FROM events WHERE id = ? AND household_id = ?`,
      id,
      user.household_id
    );

    if (!event) {
      return res.status(404).json({ error: 'Evento no encontrado' });
    }

    // Validate access: personal events only visible to owner
    if (event.context === 'personal' && event.owner_user_id !== req.user!.id) {
      return res.status(403).json({ error: 'No tienes acceso a este evento' });
    }

    // KPIs
    const kpiRow = await db.get<{ total_spent: number }>(
      `SELECT COALESCE(SUM(amount), 0) AS total_spent
       FROM expenses
       WHERE event_id = ?`,
      id
    );
    const totalSpent = kpiRow?.total_spent ?? 0;
    const kpis = {
      budget: event.budget_amount,
      spent: totalSpent,
      remaining: event.budget_amount - totalSpent,
    };

    // Category breakdown: group by expense category field, lookup emoji/color
    const categoryBreakdown = await db.all<Array<{
      category: string;
      total: number;
      emoji: string | null;
      color: string | null;
    }>>(
      `SELECT
         ex.category,
         COALESCE(SUM(ex.amount), 0) AS total,
         COALESCE(ec.emoji, c.emoji)  AS emoji,
         COALESCE(ec.color, c.color)  AS color
       FROM expenses ex
       LEFT JOIN event_categories ec
         ON ec.event_id = ? AND ec.name = ex.category
       LEFT JOIN categories c
         ON c.household_id = ? AND c.name = ex.category
          AND (c.context = 'shared' OR (c.context = 'personal' AND c.owner_user_id = ?))
       WHERE ex.event_id = ?
         AND ex.category IS NOT NULL
       GROUP BY ex.category
       ORDER BY total DESC`,
      id,
      user.household_id,
      req.user!.id,
      id
    );

    // Expense list ordered by date DESC
    const expenses = await db.all(
      `SELECT * FROM expenses
       WHERE event_id = ?
       ORDER BY date DESC`,
      id
    );

    res.json({
      event,
      kpis,
      categoryBreakdown,
      expenses,
    });
  } catch (error) {
    console.error('Error fetching event detail:', error);
    res.status(500).json({ error: 'Error al obtener detalle del evento' });
  }
});

// POST / — Create event
router.post('/', validate(eventCreateSchema), async (req: AuthRequest, res) => {
  const {
    name,
    emoji,
    budget_amount,
    start_date,
    end_date,
    goal_id,
    context,
    subcategories,
  } = req.validatedData as EventCreateInput;

  try {
    const db = getDatabase();
    const user = await db.get<{ household_id: number }>(
      'SELECT household_id FROM app_users WHERE id = ?',
      req.user!.id
    );

    if (!user) {
      return res.status(404).json({ error: 'Usuario no encontrado' });
    }

    const ownerUserId = context === 'personal' ? req.user!.id : null;

    const result = await db.run(
      `INSERT INTO events (household_id, name, emoji, budget_amount, start_date, end_date, goal_id, context, owner_user_id, created_by)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      user.household_id,
      name,
      emoji ?? '✈️',
      budget_amount ?? 0,
      start_date,
      end_date,
      goal_id ?? null,
      context,
      ownerUserId,
      req.user!.id
    );

    const eventId = result.lastID;

    if (subcategories && subcategories.length > 0) {
      for (const sub of subcategories) {
        await db.run(
          `INSERT INTO event_categories (event_id, name, emoji, color)
           VALUES (?, ?, ?, ?)
           ON CONFLICT(event_id, name) DO UPDATE SET emoji = excluded.emoji, color = excluded.color`,
          eventId,
          sub.name,
          sub.emoji,
          sub.color
        );
      }
    }

    const newEvent = await db.get('SELECT * FROM events WHERE id = ?', eventId);
    const newSubcategories = await db.all(
      'SELECT * FROM event_categories WHERE event_id = ?',
      eventId
    );

    res.status(201).json({ ...newEvent, subcategories: newSubcategories });
  } catch (error) {
    console.error('Error creating event:', error);
    res.status(500).json({ error: 'Error al crear evento' });
  }
});

// PUT /:id — Update event (partial, COALESCE pattern)
router.put('/:id', validate(eventUpdateSchema), async (req: AuthRequest, res) => {
  const { id } = req.params;
  const {
    name,
    emoji,
    budget_amount,
    start_date,
    end_date,
    goal_id,
    subcategories,
  } = req.validatedData as EventUpdateInput;

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
      'SELECT * FROM events WHERE id = ? AND household_id = ?',
      id,
      user.household_id
    );

    if (!existing) {
      return res.status(404).json({ error: 'Evento no encontrado' });
    }

    if (existing.context === 'personal' && existing.owner_user_id !== req.user!.id) {
      return res.status(403).json({ error: 'Solo puedes editar tus propios eventos personales' });
    }

    const goalIdValue = goal_id !== undefined ? (goal_id ?? null) : (existing as any).goal_id;

    await db.run(
      `UPDATE events SET
         name          = COALESCE(?, name),
         emoji         = COALESCE(?, emoji),
         budget_amount = COALESCE(?, budget_amount),
         start_date    = COALESCE(?, start_date),
         end_date      = COALESCE(?, end_date),
         goal_id       = ?
       WHERE id = ?`,
      name ?? null,
      emoji ?? null,
      budget_amount ?? null,
      start_date ?? null,
      end_date ?? null,
      goalIdValue,
      id
    );

    // Update subcategories if provided: replace all for this event
    if (subcategories) {
      await db.run('DELETE FROM event_categories WHERE event_id = ?', id);
      for (const sub of subcategories) {
        await db.run(
          `INSERT INTO event_categories (event_id, name, emoji, color) VALUES (?, ?, ?, ?)`,
          id,
          sub.name,
          sub.emoji,
          sub.color
        );
      }
    }

    const updatedEvent = await db.get('SELECT * FROM events WHERE id = ?', id);
    const updatedSubcategories = await db.all(
      'SELECT * FROM event_categories WHERE event_id = ?',
      id
    );

    res.json({ ...updatedEvent, subcategories: updatedSubcategories });
  } catch (error) {
    console.error('Error updating event:', error);
    res.status(500).json({ error: 'Error al actualizar evento' });
  }
});

// DELETE /:id — Delete event
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
      'SELECT * FROM events WHERE id = ? AND household_id = ?',
      id,
      user.household_id
    );

    if (!existing) {
      return res.status(404).json({ error: 'Evento no encontrado' });
    }

    if (existing.context === 'personal' && existing.owner_user_id !== req.user!.id) {
      return res.status(403).json({ error: 'Solo puedes eliminar tus propios eventos personales' });
    }

    // Nullify event_id on linked expenses before deleting
    await db.run('UPDATE expenses SET event_id = NULL WHERE event_id = ?', id);
    await db.run('DELETE FROM events WHERE id = ?', id);

    res.status(204).send();
  } catch (error) {
    console.error('Error deleting event:', error);
    res.status(500).json({ error: 'Error al eliminar evento' });
  }
});

export default router;

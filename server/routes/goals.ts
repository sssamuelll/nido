import { Router } from 'express';
import { getDatabase } from '../db.js';
import { AuthRequest } from '../auth.js';
import {
  goalCreateSchema,
  goalUpdateSchema,
  goalContributeSchema,
  validate,
} from '../validation.js';

const router = Router();

// Get goals: shared goals + own personal goals, scoped by household
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

    const goals = await db.all(
      `SELECT * FROM goals
       WHERE household_id = ?
         AND (owner_type = 'shared' OR (owner_type = 'personal' AND owner_user_id = ?))
       ORDER BY created_at DESC`,
      user.household_id,
      req.user!.id
    );

    res.json(goals);
  } catch (error) {
    console.error('Error fetching goals:', error);
    res.status(500).json({ error: 'Failed to fetch goals' });
  }
});

// Create goal
router.post('/', validate(goalCreateSchema), async (req: AuthRequest, res) => {
  const { name, icon, target, deadline, owner_type } = req.validatedData;

  try {
    const db = getDatabase();
    const user = await db.get<{ household_id: number }>(
      'SELECT household_id FROM app_users WHERE id = ?',
      req.user!.id
    );

    if (!user) {
      return res.status(404).json({ error: 'User not found' });
    }

    const ownerUserId = owner_type === 'personal' ? req.user!.id : null;

    const result = await db.run(
      `INSERT INTO goals (household_id, name, icon, target, deadline, owner_type, owner_user_id)
       VALUES (?, ?, ?, ?, ?, ?, ?)`,
      user.household_id,
      name,
      icon,
      target,
      deadline || null,
      owner_type,
      ownerUserId
    );

    const newGoal = await db.get('SELECT * FROM goals WHERE id = ?', result.lastID);
    res.status(201).json(newGoal);
  } catch (error) {
    console.error('Error creating goal:', error);
    res.status(500).json({ error: 'Failed to create goal' });
  }
});

// Update goal
router.put('/:id', validate(goalUpdateSchema), async (req: AuthRequest, res) => {
  const { id } = req.params;
  const { name, icon, target, deadline } = req.validatedData;

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
      'SELECT * FROM goals WHERE id = ? AND household_id = ?',
      id,
      user.household_id
    );

    if (!existing) {
      return res.status(404).json({ error: 'Goal not found' });
    }

    // 403 if personal goal of another user
    if (existing.owner_type === 'personal' && existing.owner_user_id !== req.user!.id) {
      return res.status(403).json({ error: 'Forbidden: You can only edit your own personal goals' });
    }

    await db.run(
      `UPDATE goals SET
        name = COALESCE(?, name),
        icon = COALESCE(?, icon),
        target = COALESCE(?, target),
        deadline = CASE WHEN ?1 = 1 THEN ?2 ELSE deadline END
      WHERE id = ?`,
      name,
      icon,
      target,
      deadline !== undefined ? 1 : 0,
      deadline !== undefined ? deadline : null,
      id
    );

    const updatedGoal = await db.get('SELECT * FROM goals WHERE id = ?', id);
    res.json(updatedGoal);
  } catch (error) {
    console.error('Error updating goal:', error);
    res.status(500).json({ error: 'Failed to update goal' });
  }
});

// Delete goal
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
      'SELECT * FROM goals WHERE id = ? AND household_id = ?',
      id,
      user.household_id
    );

    if (!existing) {
      return res.status(404).json({ error: 'Goal not found' });
    }

    if (existing.owner_type === 'personal' && existing.owner_user_id !== req.user!.id) {
      return res.status(403).json({ error: 'Forbidden: You can only delete your own personal goals' });
    }

    // Delete contributions first, then goal
    await db.run('DELETE FROM goal_contributions WHERE goal_id = ?', id);
    await db.run('DELETE FROM goals WHERE id = ?', id);

    res.status(204).send();
  } catch (error) {
    console.error('Error deleting goal:', error);
    res.status(500).json({ error: 'Failed to delete goal' });
  }
});

// Contribute to goal
router.post('/:id/contribute', validate(goalContributeSchema), async (req: AuthRequest, res) => {
  const { id } = req.params;
  const { amount } = req.validatedData;

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
      'SELECT * FROM goals WHERE id = ? AND household_id = ?',
      id,
      user.household_id
    );

    if (!existing) {
      return res.status(404).json({ error: 'Goal not found' });
    }

    // Insert contribution
    await db.run(
      'INSERT INTO goal_contributions (goal_id, app_user_id, amount) VALUES (?, ?, ?)',
      id,
      req.user!.id,
      amount
    );

    // Update current from SUM of contributions
    await db.run(
      `UPDATE goals SET current = (
        SELECT COALESCE(SUM(amount), 0) FROM goal_contributions WHERE goal_id = ?
      ) WHERE id = ?`,
      id,
      id
    );

    const updatedGoal = await db.get('SELECT * FROM goals WHERE id = ?', id);
    res.json(updatedGoal);
  } catch (error) {
    console.error('Error contributing to goal:', error);
    res.status(500).json({ error: 'Failed to contribute to goal' });
  }
});

export default router;

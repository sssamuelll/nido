import { Router } from 'express';
import { getDatabase } from '../db.js';
import { AuthRequest } from '../auth.js';

const router = Router();

// List notifications for user
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

    const notifications = await db.all(
      `SELECT id, type, title, body AS message, read AS is_read, created_at
       FROM notifications
       WHERE household_id = ? AND (recipient_user_id IS NULL OR recipient_user_id = ?)
       ORDER BY created_at DESC
       LIMIT 50`,
      user.household_id, req.user!.id
    );

    res.json(notifications);
  } catch (error) {
    console.error('Error fetching notifications:', error);
    res.status(500).json({ error: 'Error al obtener notificaciones' });
  }
});

// Mark single notification as read
router.put('/:id/read', async (req: AuthRequest, res) => {
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

    await db.run(
      'UPDATE notifications SET read = 1 WHERE id = ? AND household_id = ?',
      id, user.household_id
    );

    res.json({ success: true });
  } catch (error) {
    console.error('Error marking notification as read:', error);
    res.status(500).json({ error: 'Error al marcar notificación como leída' });
  }
});

// Mark all notifications as read
router.post('/read-all', async (req: AuthRequest, res) => {
  try {
    const db = getDatabase();
    const user = await db.get<{ household_id: number }>(
      'SELECT household_id FROM app_users WHERE id = ?',
      req.user!.id
    );

    if (!user) {
      return res.status(404).json({ error: 'Usuario no encontrado' });
    }

    await db.run(
      'UPDATE notifications SET read = 1 WHERE household_id = ? AND (recipient_user_id IS NULL OR recipient_user_id = ?)',
      user.household_id, req.user!.id
    );

    res.json({ success: true });
  } catch (error) {
    console.error('Error marking all notifications as read:', error);
    res.status(500).json({ error: 'Error al marcar todas las notificaciones como leídas' });
  }
});

export default router;

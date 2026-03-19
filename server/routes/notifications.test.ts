import { beforeEach, describe, expect, it, vi } from 'vitest';

const mockDb = {
  all: vi.fn(),
  get: vi.fn(),
  run: vi.fn(),
};

vi.mock('../db.js', () => ({
  getDatabase: vi.fn(() => mockDb),
}));

import notificationsRouter from './notifications.js';

const getRouteHandler = (path: string, method: 'get' | 'post' | 'put' | 'delete') => {
  const layer = notificationsRouter.stack.find(
    (entry: any) => entry.route?.path === path && entry.route?.methods?.[method]
  );
  return layer.route.stack[layer.route.stack.length - 1].handle;
};

const createResponse = () => {
  const res: any = {};
  res.status = vi.fn().mockReturnValue(res);
  res.json = vi.fn().mockReturnValue(res);
  res.send = vi.fn().mockReturnValue(res);
  return res;
};

describe('notifications routes', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockDb.get.mockResolvedValue({ household_id: 1 });
  });

  describe('GET /', () => {
    it('returns user own + broadcast notifications', async () => {
      const notifications = [
        { id: 1, type: 'expense_added', title: 'Nuevo gasto', message: 'Samuel añadió €50 en Restaurant', is_read: 0, created_at: '2026-03-19T10:00:00Z' },
        { id: 2, type: 'goal_reached', title: '¡Objetivo completado!', message: '¡El objetivo ha sido alcanzado!', is_read: 0, created_at: '2026-03-19T09:00:00Z' },
      ];
      mockDb.all.mockResolvedValue(notifications);

      const handler = getRouteHandler('/', 'get');
      const req: any = { user: { id: 1, username: 'samuel' } };
      const res = createResponse();

      await handler(req, res);

      // Verify query filters by household_id and recipient_user_id
      expect(mockDb.all).toHaveBeenCalledWith(
        expect.stringContaining('recipient_user_id IS NULL OR recipient_user_id = ?'),
        1, // household_id
        1  // user id
      );
      expect(res.json).toHaveBeenCalledWith(notifications);
    });

    it('does NOT return another user targeted notifications (enforced by SQL)', async () => {
      // Maria's targeted notifications should not appear for Samuel
      // because the SQL filters: recipient_user_id IS NULL OR recipient_user_id = <current_user_id>
      const samuelNotifications = [
        { id: 2, type: 'goal_reached', title: 'Broadcast', message: 'Goal reached', is_read: 0, created_at: '2026-03-19T09:00:00Z' },
      ];
      mockDb.all.mockResolvedValue(samuelNotifications);

      const handler = getRouteHandler('/', 'get');
      const req: any = { user: { id: 1, username: 'samuel' } };
      const res = createResponse();

      await handler(req, res);

      // The SQL query filters by recipient_user_id matching the requesting user
      expect(mockDb.all).toHaveBeenCalledWith(
        expect.stringContaining('recipient_user_id IS NULL OR recipient_user_id = ?'),
        1, // household_id
        1  // samuel's user id — maria's targeted notifications (recipient_user_id=2) won't match
      );
      // Only the broadcast notification is returned, not maria's targeted one
      expect(res.json).toHaveBeenCalledWith(samuelNotifications);
    });

    it('SELECT aliases body AS message and read AS is_read to match component interface', async () => {
      mockDb.all.mockResolvedValue([]);

      const handler = getRouteHandler('/', 'get');
      const req: any = { user: { id: 1, username: 'samuel' } };
      const res = createResponse();

      await handler(req, res);

      const query = mockDb.all.mock.calls[0][0];
      expect(query).toContain('body AS message');
      expect(query).toContain('read AS is_read');
    });
  });

  describe('PUT /:id/read', () => {
    it('marks a notification as read', async () => {
      mockDb.run.mockResolvedValue({ changes: 1 });

      const handler = getRouteHandler('/:id/read', 'put');
      const req: any = { params: { id: '5' }, user: { id: 1, username: 'samuel' } };
      const res = createResponse();

      await handler(req, res);

      expect(mockDb.run).toHaveBeenCalledWith(
        expect.stringContaining('UPDATE notifications SET read = 1'),
        '5',
        1 // household_id
      );
      expect(res.json).toHaveBeenCalledWith({ success: true });
    });
  });

  describe('POST /read-all', () => {
    it('marks all user notifications as read', async () => {
      mockDb.run.mockResolvedValue({ changes: 3 });

      const handler = getRouteHandler('/read-all', 'post');
      const req: any = { user: { id: 1, username: 'samuel' } };
      const res = createResponse();

      await handler(req, res);

      expect(mockDb.run).toHaveBeenCalledWith(
        expect.stringContaining('UPDATE notifications SET read = 1'),
        1, // household_id
        1  // user id
      );
      expect(res.json).toHaveBeenCalledWith({ success: true });
    });
  });
});

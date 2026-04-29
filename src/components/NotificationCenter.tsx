import React, { useState, useEffect, useCallback } from 'react';
import { Api } from '../api';
import { X, Bell, Check } from 'lucide-react';
import { formatDistanceToNow } from 'date-fns';
import { es } from 'date-fns/locale';
import { handleApiError } from '../lib/handleApiError';
import { CACHE_KEYS, cacheBus } from '../lib/cacheBus';

interface Notification {
  id: number;
  type: string;
  title: string;
  message: string;
  is_read: number;
  created_at: string;
}

interface NotificationCenterProps {
  onClose: () => void;
}

export const NotificationCenter: React.FC<NotificationCenterProps> = ({ onClose }) => {
  const [notifications, setNotifications] = useState<Notification[]>([]);
  const [loading, setLoading] = useState(true);

  const loadNotifications = useCallback(async () => {
    try {
      setLoading(true);
      const data = await Api.getNotifications();
      setNotifications(data);
    } catch (err) {
      handleApiError(err, 'Error al cargar notificaciones', { silent: true });
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { loadNotifications(); }, [loadNotifications]);

  useEffect(() => cacheBus.subscribe(CACHE_KEYS.notifications, loadNotifications), [loadNotifications]);

  const markAsRead = async (id: number) => {
    try {
      await Api.markNotificationAsRead(id);
      cacheBus.invalidate(CACHE_KEYS.notifications);
      setNotifications(prev => prev.map(n => n.id === id ? { ...n, is_read: 1 } : n));
    } catch (err) {
      handleApiError(err, 'Error al marcar como leída', { silent: true });
    }
  };

  const markAllAsRead = async () => {
    try {
      await Api.markAllNotificationsRead();
      cacheBus.invalidate(CACHE_KEYS.notifications);
      setNotifications(prev => prev.map(n => ({ ...n, is_read: 1 })));
    } catch (err) {
      handleApiError(err, 'Error al marcar todas como leídas', { silent: true });
    }
  };

  const unreadCount = notifications.filter(n => !n.is_read).length;

  return (
    <div className="notification-center__overlay" onClick={onClose}>
      <div className="notification-center__panel" onClick={e => e.stopPropagation()}>
        <div className="notification-center__header">
          <div className="u-flex-center">
            <Bell size={20} color="var(--color-samuel)" />
            <h2 className="notification-center__title">Notificaciones</h2>
          </div>
          <div className="u-flex-center" style={{ gap: '8px' }}>
            {unreadCount > 0 && (
              <button onClick={markAllAsRead} className="notification-center__mark-all" title="Marcar todas como leídas">
                <Check size={16} />
              </button>
            )}
            <button onClick={onClose} className="notification-center__close">
              <X size={20} />
            </button>
          </div>
        </div>

        <div className="notification-center__list">
          {loading ? (
            <div className="u-py-60 u-text-center">Cargando...</div>
          ) : notifications.length === 0 ? (
            <div className="empty-view u-py-60">
              <div className="empty-view__emoji">🔔</div>
              <div className="empty-view__text">No tienes notificaciones pendientes</div>
            </div>
          ) : (
            notifications.map(n => (
              <div key={n.id} className={`notification-item ${n.is_read ? 'notification-item--read' : ''}`} onClick={() => !n.is_read && markAsRead(n.id)}>
                <div className="notification-item__icon">
                  <Bell size={18} />
                </div>
                <div className="notification-item__content">
                  <div className="notification-item__header">
                    <span className="notification-item__title">{n.title}</span>
                    <span className="notification-item__time">
                      {formatDistanceToNow(new Date(n.created_at), { addSuffix: true, locale: es })}
                    </span>
                  </div>
                  <p className="notification-item__message">{n.message}</p>
                </div>
                {!n.is_read && <div className="notification-item__badge" />}
              </div>
            ))
          )}
        </div>
      </div>
    </div>
  );
};

import React, { useState } from 'react';
import type { AppNotification } from '../types';

interface NotificationsViewProps {
  notifications: AppNotification[];
  onMarkAllRead: () => void;
  onToggleRead: (id: string) => void;
}

export const NotificationsView: React.FC<NotificationsViewProps> = ({
  notifications,
  onMarkAllRead,
  onToggleRead,
}) => {
  const [filter, setFilter] = useState<'all' | 'unread'>('all');

  const visible =
    filter === 'unread' ? notifications.filter((n) => !n.read) : notifications;

  return (
    <div className="ws-card" style={{ maxWidth: '780px' }}>
      <div
        style={{
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          gap: '12px',
          flexWrap: 'wrap',
          marginBottom: '18px',
        }}
      >
        <div>
          <p className="eyebrow" style={{ marginBottom: '6px' }}>
            NOTIFICATIONS
          </p>
          <h1 className="heading-md">Activity &amp; alerts</h1>
        </div>

        <div style={{ display: 'flex', gap: '8px', flexWrap: 'wrap' }}>
          <button
            type="button"
            className={`ws-nav-tab ${filter === 'all' ? 'is-active' : ''}`}
            style={{ border: '1px solid var(--line)' }}
            onClick={() => setFilter('all')}
          >
            All
          </button>
          <button
            type="button"
            className={`ws-nav-tab ${filter === 'unread' ? 'is-active' : ''}`}
            style={{ border: '1px solid var(--line)' }}
            onClick={() => setFilter('unread')}
          >
            Unread
          </button>
          <button type="button" className="ws-ghost-btn" onClick={onMarkAllRead}>
            Mark all read
          </button>
        </div>
      </div>

      {visible.length === 0 ? (
        <p className="body-md" style={{ paddingBlock: '24px' }}>
          No unread notifications.
        </p>
      ) : (
        <div>
          {visible.map((n) => (
            <div key={n.id} className="ws-notif-row">
              <div style={{ display: 'flex', gap: '12px', alignItems: 'flex-start' }}>
                {!n.read && <span className="ws-unread-dot" aria-label="Unread" />}
                <div>
                  <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '3px' }}>
                    <span style={{ fontSize: '14.5px', fontWeight: 500, color: 'var(--ink)' }}>
                      {n.title}
                    </span>
                    <span className="ws-badge">{n.category}</span>
                  </div>
                  <p className="body-sm">{n.detail}</p>
                </div>
              </div>
              <div style={{ textAlign: 'right', flexShrink: 0 }}>
                <p className="body-sm" style={{ fontSize: '12px', color: 'var(--mute)' }}>
                  {n.time}
                </p>
                <button
                  type="button"
                  className="text-link"
                  style={{
                    background: 'transparent',
                    border: 'none',
                    fontSize: '12px',
                    marginTop: '4px',
                  }}
                  onClick={() => onToggleRead(n.id)}
                >
                  {n.read ? 'Mark unread' : 'Mark read'}
                </button>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
};


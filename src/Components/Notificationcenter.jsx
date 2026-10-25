import React, { useState, useEffect, useRef } from 'react';
import { useNavigate } from 'react-router-dom';
import { Bell, X, Check } from 'lucide-react';
import { api } from '@/lib/localApi';
import { cn } from '@/lib/utils';

const ICONS = {
  new_booking: Bell,
  cancellation: X,
  reschedule: Bell,
  calendar_error: Bell,
  whatsapp_error: Bell,
  upcoming_meeting: Bell,
  waitlist_available: Bell,
  booking_request: Bell,
};

export default function NotificationCenter() {
  const [open, setOpen] = useState(false);
  const [notifications, setNotifications] = useState([]);
  const [loading, setLoading] = useState(false);
  const ref = useRef(null);
  const navigate = useNavigate();

  const unread = notifications.filter((n) => !n.read).length;

  useEffect(() => {
    if (open) loadNotifications();
  }, [open]);

  useEffect(() => {
    const handler = (e) => { if (ref.current && !ref.current.contains(e.target)) setOpen(false); };
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, []);

  const loadNotifications = async () => {
    setLoading(true);
    try {
      const list = await api.entities.Notification.filter({}, '-created_date', 20);
      setNotifications(list);
    } catch {}
    setLoading(false);
  };

  const markAllRead = async () => {
    const unreadIds = notifications.filter((n) => !n.read).map((n) => n.id);
    if (!unreadIds.length) return;
    await api.entities.Notification.bulkUpdate(unreadIds.map((id) => ({ id, read: true })));
    setNotifications((prev) => prev.map((n) => ({ ...n, read: true })));
  };

  const handleClick = (n) => {
    if (!n.read) api.entities.Notification.update(n.id, { read: true });
    if (n.link) navigate(n.link);
    setOpen(false);
  };

  return (
    <div className="relative" ref={ref}>
      <button
        onClick={() => setOpen(!open)}
        aria-label="Notifications"
        className="relative w-10 h-10 rounded-full flex items-center justify-center text-muted-foreground transition-all duration-200 hover:bg-secondary hover:text-foreground"
      >
        <Bell className="w-[18px] h-[18px]" />
        {unread > 0 && (
          <span className="absolute -top-1 -right-1 w-4 h-4 rounded-full bg-destructive text-white text-[10px] font-bold flex items-center justify-center">
            {unread > 9 ? '9+' : unread}
          </span>
        )}
      </button>

      {open && (
        <div className="absolute right-0 top-12 w-80 max-w-[calc(100vw-2rem)] rounded-xl border border-border bg-popover shadow-pop overflow-hidden animate-scale-in z-50">
          <div className="flex items-center justify-between px-4 py-3 border-b border-border">
            <h3 className="font-bold text-sm">Notifications</h3>
            {unread > 0 && (
              <button onClick={markAllRead} className="text-xs text-link font-semibold flex items-center gap-1 hover:underline">
                <Check className="w-3 h-3" /> Mark all read
              </button>
            )}
          </div>
          <div className="max-h-80 overflow-y-auto">
            {loading ? (
              <div className="px-4 py-8 text-center text-sm text-muted-foreground">Loading…</div>
            ) : notifications.length === 0 ? (
              <div className="px-4 py-8 text-center text-sm text-muted-foreground">No notifications.</div>
            ) : (
              notifications.map((n) => (
                <button
                  key={n.id}
                  onClick={() => handleClick(n)}
                  className={cn('w-full flex items-start gap-3 px-4 py-3 text-left border-b border-border last:border-b-0 transition-all duration-200 hover:bg-secondary', !n.read && 'bg-primary-soft/50')}
                >
                  <div className={cn('w-2 h-2 rounded-full mt-1.5 shrink-0', n.read ? 'bg-transparent' : 'bg-primary')} />
                  <div className="flex-1 min-w-0">
                    <div className="text-sm font-medium truncate">{n.title}</div>
                    {n.message && <div className="text-xs text-muted-foreground line-clamp-2">{n.message}</div>}
                  </div>
                </button>
              ))
            )}
          </div>
        </div>
      )}
    </div>
  );
}
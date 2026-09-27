import React, { useState, useEffect, useRef } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  CalendarClock, Calendar, BookOpen, Clock, MessageCircle, CalendarCheck,
  Settings, Plus, Search, BarChart3, Bell, X, CornerDownLeft,
} from 'lucide-react';

const COMMANDS = [
  { label: 'Create event', icon: Plus, path: '/event-types?new=true', desc: 'New event type' },
  { label: 'Find a time', icon: Clock, path: '/calendar?find=true', desc: 'Compare availability' },
  { label: 'View calendar', icon: Calendar, path: '/calendar', desc: 'Open calendar view' },
  { label: 'Search bookings', icon: BookOpen, path: '/bookings', desc: 'Browse all bookings' },
  { label: 'Open WhatsApp', icon: MessageCircle, path: '/whatsapp', desc: 'WhatsApp settings' },
  { label: 'Calendar connections', icon: CalendarCheck, path: '/calendar-connections', desc: 'Manage calendar sync' },
  { label: 'Availability', icon: Clock, path: '/availability', desc: 'Edit working hours' },
  { label: 'Analytics', icon: BarChart3, path: '/analytics', desc: 'View booking insights' },
  { label: 'Notifications', icon: Bell, path: '/notifications', desc: 'Notification center' },
  { label: 'Settings', icon: Settings, path: '/settings', desc: 'Account preferences' },
];

export default function CommandPalette({ open, onClose }) {
  const [query, setQuery] = useState('');
  const [selected, setSelected] = useState(0);
  const inputRef = useRef(null);
  const navigate = useNavigate();

  useEffect(() => {
    if (open) {
      setQuery('');
      setSelected(0);
      setTimeout(() => inputRef.current?.focus(), 50);
    }
  }, [open]);

  const filtered = COMMANDS.filter((c) =>
    c.label.toLowerCase().includes(query.toLowerCase()) ||
    c.desc.toLowerCase().includes(query.toLowerCase())
  );

  useEffect(() => { setSelected(0); }, [query]);

  const handleKey = (e) => {
    if (e.key === 'ArrowDown') { e.preventDefault(); setSelected((s) => Math.min(s + 1, filtered.length - 1)); }
    else if (e.key === 'ArrowUp') { e.preventDefault(); setSelected((s) => Math.max(s - 1, 0)); }
    else if (e.key === 'Enter' && filtered[selected]) {
      e.preventDefault();
      navigate(filtered[selected].path);
      onClose();
    } else if (e.key === 'Escape') { onClose(); }
  };

  if (!open) return null;

  return (
    <div className="fixed inset-0 z-[100] flex items-start justify-center pt-[15vh] px-4" onClick={onClose}>
      <div className="absolute inset-0 bg-black/30 backdrop-blur-sm animate-fade-in" />
      <div
        className="glass-panel w-full max-w-xl overflow-hidden animate-scale-in relative"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center gap-3 px-4 py-3 border-b border-border/60">
          <Search className="w-4 h-4 text-muted-foreground" />
          <input
            ref={inputRef}
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            onKeyDown={handleKey}
            placeholder="Type a command or search…"
            className="flex-1 bg-transparent outline-none text-sm text-foreground placeholder:text-muted-foreground"
          />
          <button onClick={onClose} className="w-6 h-6 rounded-lg glass flex items-center justify-center"><X className="w-3.5 h-3.5" /></button>
        </div>
        <div className="max-h-80 overflow-y-auto p-2">
          {filtered.length === 0 ? (
            <div className="px-4 py-8 text-center text-sm text-muted-foreground">No commands found.</div>
          ) : (
            filtered.map((cmd, i) => (
              <button
                key={cmd.label}
                onClick={() => { navigate(cmd.path); onClose(); }}
                onMouseEnter={() => setSelected(i)}
                className={`w-full flex items-center gap-3 px-3 py-2.5 rounded-xl text-left transition-colors ${i === selected ? 'bg-foreground/5' : ''}`}
              >
                <div className="w-8 h-8 rounded-lg glass flex items-center justify-center shrink-0">
                  <cmd.icon className="w-4 h-4" />
                </div>
                <div className="flex-1 min-w-0">
                  <div className="text-sm font-medium">{cmd.label}</div>
                  <div className="text-xs text-muted-foreground">{cmd.desc}</div>
                </div>
                {i === selected && <CornerDownLeft className="w-3.5 h-3.5 text-muted-foreground" />}
              </button>
            ))
          )}
        </div>
      </div>
    </div>
  );
}
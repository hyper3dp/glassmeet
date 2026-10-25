import React, { useEffect, useState, useMemo } from 'react';
import { X, Clock, Loader2, Calendar as CalendarIcon } from 'lucide-react';
import { api } from '@/lib/localApi';
import { GlassButton } from '@/components/glass';
import { generateSlots, detectTimezone, formatDate } from '@/lib/Availability.js';
import { Dialog, DialogContent, DialogTitle } from '@/components/ui/dialog';

const DAY_LABELS = ['Today', 'Tomorrow'];

export default function FindATime({ open, onClose, profile, onSelectSlot }) {
  const [eventTypes, setEventTypes] = useState([]);
  const [selectedEvent, setSelectedEvent] = useState(null);
  const [rules, setRules] = useState([]);
  const [exceptions, setExceptions] = useState([]);
  const [bookedSlots, setBookedSlots] = useState([]);
  const [loading, setLoading] = useState(false);
  const tz = profile?.timezone || detectTimezone();

  useEffect(() => {
    if (!open) return;
    (async () => {
      setLoading(true);
      try {
        const events = await api.entities.EventType.filter({ created_by_id: profile.id, active: true }, '-created_date');
        setEventTypes(events);
        if (events.length) setSelectedEvent(events[0]);

        const [r, e, b] = await Promise.all([
          api.entities.AvailabilityRule.filter({ created_by_id: profile.id }),
          api.entities.AvailabilityException.filter({ created_by_id: profile.id }),
          api.entities.BookedSlot.filter({ host_id: profile.id, status: 'confirmed' }),
        ]);
        setRules(r);
        setExceptions(e);
        setBookedSlots(b);
      } catch {}
      setLoading(false);
    })();
  }, [open, profile.id]);

  // Generate slots for the next 7 days
  const daySlots = useMemo(() => {
    if (!selectedEvent) return [];
    const days = [];
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    for (let i = 0; i < 7; i++) {
      const date = new Date(today);
      date.setDate(date.getDate() + i);
      const slots = generateSlots(date, selectedEvent, rules, exceptions, bookedSlots, tz);
      if (slots.length > 0) {
        days.push({ date, slots, label: i < 2 ? DAY_LABELS[i] : date.toLocaleDateString('en-US', { weekday: 'long', month: 'short', day: 'numeric' }) });
      }
    }
    return days;
  }, [selectedEvent, rules, exceptions, bookedSlots, tz]);

  if (!open) return null;

  return (
    <Dialog open={open} onOpenChange={(next) => { if (!next) onClose(); }}>
      <DialogContent showCloseButton={false} aria-describedby={undefined} className="max-w-lg max-h-[85vh] overflow-y-auto p-6 block">
        <div className="flex items-center justify-between mb-5">
          <div className="flex items-center gap-2">
            <Clock className="w-5 h-5 text-link" />
            <DialogTitle>Find a Time</DialogTitle>
          </div>
          <button onClick={onClose} aria-label="Close" className="w-8 h-8 rounded-full flex items-center justify-center text-muted-foreground hover:bg-secondary"><X className="w-4 h-4" /></button>
        </div>

        {loading ? (
          <div className="flex justify-center py-12"><Loader2 className="w-6 h-6 animate-spin text-muted-foreground" /></div>
        ) : eventTypes.length === 0 ? (
          <div className="text-center py-8 text-sm text-muted-foreground">Create an event type first to find available times.</div>
        ) : (
          <>
            {/* Event selector */}
            {eventTypes.length > 1 && (
              <div className="flex gap-2 flex-wrap mb-5">
                {eventTypes.map((e) => (
                  <button
                    key={e.id}
                    onClick={() => setSelectedEvent(e)}
                    className={`rounded-full border px-3.5 h-8 text-sm font-semibold transition-all duration-200 ${selectedEvent?.id === e.id ? 'border-primary bg-primary-soft text-link' : 'border-border hover:border-border-hover'}`}
                  >
                    {e.name}
                  </button>
                ))}
              </div>
            )}

            <p className="text-xs text-muted-foreground mb-4">Times that work — in {tz}</p>

            {daySlots.length === 0 ? (
              <div className="text-center py-8">
                <CalendarIcon className="w-8 h-8 text-muted-foreground mx-auto mb-3" />
                <p className="text-sm text-muted-foreground">No available times in the next 7 days.</p>
                <p className="text-xs text-muted-foreground mt-1">Try adjusting your availability settings.</p>
              </div>
            ) : (
              <div className="space-y-5">
                {daySlots.map((day, di) => (
                  <div key={di}>
                    <div className="text-sm font-bold mb-2">{day.label}</div>
                    <div className="grid grid-cols-3 gap-2">
                      {day.slots.map((s, si) => (
                        <button
                          key={si}
                          onClick={() => { onSelectSlot?.(s, selectedEvent); onClose(); }}
                          className="rounded-lg border border-primary/50 py-2.5 text-sm font-bold text-link tabular transition-all duration-200 hover:border-primary hover:bg-primary-soft"
                        >
                          {s.label}
                        </button>
                      ))}
                    </div>
                  </div>
                ))}
              </div>
            )}
          </>
        )}
      </DialogContent>
    </Dialog>
  );
}
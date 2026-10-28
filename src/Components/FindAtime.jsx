import React, { useEffect, useState, useMemo } from 'react';
import { X, Clock, Loader2, Calendar as CalendarIcon } from 'lucide-react';
import { api } from '@/lib/localApi';
import { GlassButton } from '@/components/glass';
import { generateSlots, detectTimezone, dateInZone } from '@/lib/Availability.js';
import { Dialog, DialogContent, DialogTitle } from '@/components/ui/dialog';
import { toast } from 'sonner';
import { holidayExceptions } from '@/lib/holidays.js';
import { bookingUrlFor } from '@/components/eventcard.jsx';

const DAY_LABELS = ['Today', 'Tomorrow'];

export default function FindATime({ open, onClose, profile, onSelectSlot }) {
  const [eventTypes, setEventTypes] = useState([]);
  const [selectedEvent, setSelectedEvent] = useState(null);
  const [rules, setRules] = useState([]);
  const [exceptions, setExceptions] = useState([]);
  const [bookedSlots, setBookedSlots] = useState([]);
  const [loading, setLoading] = useState(false);
  const [loadFailed, setLoadFailed] = useState(false);
  const [reloads, setReloads] = useState(0);
  const profileTz = profile?.timezone || detectTimezone();
  // the event's own zone, as the booking page and the server use
  const tz = selectedEvent?.host_timezone || profileTz;

  useEffect(() => {
    if (!open) return;
    (async () => {
      setLoading(true);
      setLoadFailed(false);
      try {
        // all at once: none of these needs another's answer
        const [events, r, e, b, h] = await Promise.all([
          api.entities.EventType.filter({ created_by_id: profile.id, active: true }, '-created_date'),
          api.entities.AvailabilityRule.filter({ created_by_id: profile.id }),
          api.entities.AvailabilityException.filter({ created_by_id: profile.id }),
          api.entities.BookedSlot.filter({ host_id: profile.id, status: 'confirmed' }),
          // public holidays the host blocks are closed on the booking page too
          api.holidays.forHost(profile.id).catch(() => []),
        ]);
        setEventTypes(events);
        // keep the event picked before a reload while it's still there
        setSelectedEvent((cur) => events.find((x) => x.id === cur?.id) || events[0] || null);
        setRules(r);
        setExceptions([...e, ...holidayExceptions(h)]);
        setBookedSlots(b);
      } catch {
        setLoadFailed(true);
      }
      setLoading(false);
    })();
  }, [open, profile.id, reloads]);

  // a time is shared as the event's booking link opened on that day
  const shareSlot = async (day, slot) => {
    if (onSelectSlot) { onSelectSlot(slot, selectedEvent); onClose(); return; }
    // the exact time, so the page opens on the right day in the guest's own zone
    const url = `${bookingUrlFor(selectedEvent.id)}?at=${encodeURIComponent(slot.date.toISOString())}`;
    try {
      await navigator.clipboard.writeText(url);
      toast.success(`Link copied: ${selectedEvent.name}, opening on ${day.label} (${slot.label} is free)`);
    } catch {
      toast.error('Couldn’t copy the link. Copy it from Event types instead.');
    }
  };

  // Generate slots for the next 7 days
  const daySlots = useMemo(() => {
    if (!selectedEvent) return [];
    const days = [];
    const today = dateInZone(Date.now(), tz); // "today" in the host's zone, not the browser's
    for (let i = 0; i < 7; i++) {
      const date = new Date(today);
      date.setDate(date.getDate() + i);
      const slots = generateSlots(date, selectedEvent, rules, exceptions, bookedSlots, tz, tz);
      if (slots.length > 0) {
        days.push({ date, slots, label: i < 2 ? DAY_LABELS[i] : date.toLocaleDateString('en-US', { weekday: 'long', month: 'short', day: 'numeric' }) });
      }
    }
    return days;
  }, [selectedEvent, rules, exceptions, bookedSlots, tz]);

  if (!open) return null;

  return (
    <Dialog open={open} onOpenChange={(next) => { if (!next) onClose(); }}>
      <DialogContent showCloseButton={false} aria-describedby={undefined} className="sm:max-w-lg p-6 block">
        <div className="flex items-center justify-between mb-5">
          <div className="flex items-center gap-2">
            <Clock className="w-5 h-5 text-link" />
            <DialogTitle>Find a time</DialogTitle>
          </div>
          <button onClick={onClose} aria-label="Close" className="w-8 h-8 rounded-full flex items-center justify-center text-muted-foreground hover:bg-secondary"><X className="w-4 h-4" /></button>
        </div>

        {loading ? (
          <div className="flex justify-center py-12"><Loader2 className="w-6 h-6 animate-spin text-muted-foreground" /></div>
        ) : loadFailed ? (
          <div role="alert" className="text-center py-8 text-sm text-muted-foreground">
            Your times couldn’t be loaded.
            <div className="mt-3"><GlassButton type="button" size="sm" onClick={() => setReloads((n) => n + 1)}>Try again</GlassButton></div>
          </div>
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

            <p className="text-xs text-muted-foreground mb-4">Times that work, in {tz}. Pick one to copy a booking link that opens on that day.</p>

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
                          onClick={() => shareSlot(day, s)}
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
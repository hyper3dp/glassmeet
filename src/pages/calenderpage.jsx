import React, { useEffect, useState, useMemo, useRef } from 'react';
import { api } from '@/lib/localApi';
import { ChevronLeft, ChevronRight, Calendar as CalIcon, Zap } from 'lucide-react';
import { GlassButton, Spinner, EmptyState, PageHeader } from '@/components/glass';
import { formatMeetingTime } from '@/lib/whatsapp';
import { detectTimezone, dateInZone } from '@/lib/Availability.js';
import FindATime from '@/components/FindAtime.jsx';

// y-m-d of a local calendar cell, and of a booking in the host time zone
const cellKey = (d) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
const bookingKey = (iso, tz) => new Date(iso).toLocaleDateString('en-CA', { timeZone: tz });

// today's date in the host's zone (the browser may be somewhere else)
const todayIn = (tz) => dateInZone(Date.now(), tz);
const isPending = (b) => b.approval_status === 'pending';

export default function CalendarPage({ profile }) {
  const [view, setView] = useState('month'); // month | week | day
  const [cursor, setCursor] = useState(() => todayIn(profile?.timezone || detectTimezone()));
  const [bookings, setBookings] = useState([]);
  const [loading, setLoading] = useState(true);
  const [selectedDay, setSelectedDay] = useState(null);
  // the command palette's "Find a time" links here with ?find=true
  const [showFindTime, setShowFindTime] = useState(() => new URLSearchParams(window.location.search).get('find') === 'true');
  const timezone = profile?.timezone || detectTimezone();

  useEffect(() => { load(); }, []);

  const load = async () => {
    try {
      const b = await api.entities.Booking.filter({ host_id: profile.id }, '-start_time', 1000);
      // everything still on (confirmed, completed, and requests awaiting approval)
      setBookings(b.filter((x) => x.status !== 'cancelled'));
    } catch (e) {}
    setLoading(false);
  };

  const bookingsByDay = useMemo(() => {
    const map = {};
    for (const b of bookings) {
      const key = bookingKey(b.start_time, timezone);
      (map[key] = map[key] || []).push(b);
    }
    return map;
  }, [bookings, timezone]);

  const move = (dir) => {
    const d = new Date(cursor);
    if (view === 'month') d.setMonth(d.getMonth() + dir);
    if (view === 'week') d.setDate(d.getDate() + dir * 7);
    if (view === 'day') d.setDate(d.getDate() + dir);
    setCursor(d);
  };

  const title = useMemo(() => {
    if (view === 'month') return cursor.toLocaleDateString('en-US', { month: 'long', year: 'numeric' });
    if (view === 'day') return cursor.toLocaleDateString('en-US', { weekday: 'long', month: 'long', day: 'numeric' });
    const start = new Date(cursor); start.setDate(start.getDate() - start.getDay());
    const end = new Date(start); end.setDate(end.getDate() + 6);
    return `${start.toLocaleDateString('en-US',{month:'short',day:'numeric'})} – ${end.toLocaleDateString('en-US',{month:'short',day:'numeric'})}`;
  }, [cursor, view]);

  if (loading) return <div className="flex justify-center py-24"><Spinner /></div>;

  return (
    <div className="space-y-6 animate-fade-in">
      <PageHeader
        title="Calendar"
        actions={<GlassButton type="button" onClick={() => setShowFindTime(true)}><Zap className="w-4 h-4" /> Find a time</GlassButton>}
      />

      <div className="rounded-xl border border-border bg-card shadow-card p-4 sm:p-6">
        <div className="flex flex-wrap items-center justify-between gap-3 mb-5">
          <div className="flex items-center gap-2">
            <button onClick={()=>{ setCursor(todayIn(timezone)); setSelectedDay(null); }} className="h-9 px-4 rounded-full border border-input text-sm font-semibold transition-all duration-200 hover:bg-secondary">Today</button>
            <button onClick={()=>move(-1)} aria-label="Previous" className="w-9 h-9 rounded-full flex items-center justify-center text-muted-foreground transition-all duration-200 hover:bg-secondary hover:text-foreground"><ChevronLeft className="w-5 h-5" /></button>
            <button onClick={()=>move(1)} aria-label="Next" className="w-9 h-9 rounded-full flex items-center justify-center text-muted-foreground transition-all duration-200 hover:bg-secondary hover:text-foreground"><ChevronRight className="w-5 h-5" /></button>
            <h2 className="ml-1 text-lg font-bold">{title}</h2>
          </div>
          <div role="tablist" className="flex rounded-full border border-input p-0.5">
            {['month','week','day'].map((v) => (
              <button key={v} role="tab" aria-selected={view===v} onClick={()=>setView(v)} className={`h-8 px-4 rounded-full text-sm font-semibold capitalize transition-all duration-200 ${view===v?'bg-primary-soft text-link':'text-muted-foreground hover:text-foreground'}`}>{v}</button>
            ))}
          </div>
        </div>

        {view === 'month' && <MonthView cursor={cursor} today={todayIn(timezone)} bookingsByDay={bookingsByDay} timezone={timezone} selectedDay={selectedDay} onSelect={(d)=>{ setSelectedDay(d); }} />}
        {view === 'week' && <WeekView cursor={cursor} today={todayIn(timezone)} bookingsByDay={bookingsByDay} timezone={timezone} />}
        {view === 'day' && <DayView date={cursor} bookings={bookingsByDay[cellKey(cursor)]||[]} timezone={timezone} />}
      </div>

      {selectedDay && (
        <DayPanel date={selectedDay} bookings={bookingsByDay[cellKey(selectedDay)]||[]} timezone={timezone} onClose={()=>setSelectedDay(null)} />
      )}

      <FindATime open={showFindTime} onClose={() => setShowFindTime(false)} profile={profile} />
    </div>
  );
}

function MonthView({ cursor, today, bookingsByDay, timezone, selectedDay, onSelect }) {
  const year = cursor.getFullYear(), month = cursor.getMonth();
  const first = new Date(year, month, 1);
  const startDay = first.getDay();
  const daysInMonth = new Date(year, month + 1, 0).getDate();
  const cells = [];
  for (let i = 0; i < startDay; i++) cells.push(null);
  for (let d = 1; d <= daysInMonth; d++) cells.push(new Date(year, month, d));

  return (
    <div>
      <div className="grid grid-cols-7 mb-2">
        {['Sun','Mon','Tue','Wed','Thu','Fri','Sat'].map((d)=>(
          <div key={d} className="text-center text-xs font-semibold uppercase text-muted-foreground py-2">{d}</div>
        ))}
      </div>
      <div className="grid grid-cols-7 gap-px overflow-hidden rounded-lg border border-border bg-border">
        {cells.map((date, i) => {
          if (!date) return <div key={i} className="bg-background" />;
          const key = cellKey(date);
          const dayBookings = bookingsByDay[key] || [];
          const isToday = date.getTime() === today.getTime();
          const isSelected = selectedDay && cellKey(selectedDay) === key;
          return (
            <button key={i} onClick={()=>onSelect(date)} aria-pressed={!!isSelected}
              aria-label={`${date.toLocaleDateString('en-US',{weekday:'long',month:'long',day:'numeric'})}, ${dayBookings.length} ${dayBookings.length === 1 ? 'meeting' : 'meetings'}`}
              className={`p-1.5 sm:p-2 min-h-[60px] sm:min-h-[96px] text-left flex flex-col items-center sm:items-stretch gap-1 transition-all duration-200 ${isSelected ? 'bg-primary-soft' : 'bg-card hover:bg-secondary'}`}>
              <span className={`w-7 h-7 rounded-full text-sm font-semibold tabular flex items-center justify-center ${isToday?'bg-primary text-primary-foreground':''}`}>{date.getDate()}</span>
              {/* phones: a dot per meeting (tap the day for the list); wider: time + name chips */}
              {dayBookings.length > 0 && (
                <span className="sm:hidden flex items-center gap-0.5" aria-hidden="true">
                  {dayBookings.slice(0,3).map((b)=><span key={b.id} className={`w-1.5 h-1.5 rounded-full ${isPending(b) ? 'bg-warning' : 'bg-primary'}`} />)}
                  {dayBookings.length > 3 && <span className="text-[10px] font-semibold leading-none text-link">+</span>}
                </span>
              )}
              <div className="hidden sm:flex flex-col gap-0.5 overflow-hidden">
                {dayBookings.slice(0,2).map((b)=>(
                  <span key={b.id} className={`text-[11px] font-semibold truncate rounded px-1.5 py-0.5 ${isPending(b) ? 'text-warning bg-warning/15' : 'text-link bg-primary-soft'}`}>{formatMeetingTime(b.start_time, timezone)} {b.guest_name}{isPending(b) ? ' (pending)' : ''}</span>
                ))}
                {dayBookings.length > 2 && <span className="text-[10px] text-muted-foreground">+{dayBookings.length-2} more</span>}
              </div>
            </button>
          );
        })}
      </div>
    </div>
  );
}

function WeekView({ cursor, today, bookingsByDay, timezone }) {
  const start = new Date(cursor); start.setDate(start.getDate() - start.getDay());
  const days = Array.from({length:7}, (_,i) => { const d = new Date(start); d.setDate(d.getDate()+i); return d; });
  return (
    <div className="grid grid-cols-1 sm:grid-cols-7 gap-2">
      {days.map((date, i) => {
        const key = cellKey(date);
        const dayBookings = (bookingsByDay[key]||[]).sort((a,b)=> new Date(a.start_time)-new Date(b.start_time));
        const isToday = date.getTime() === today.getTime();
        return (
          <div key={i} className={`rounded-lg border p-3 min-h-[120px] ${isToday?'border-primary':'border-border'}`}>
            <div className={`text-xs font-semibold mb-2 ${isToday?'text-link':'text-muted-foreground'}`}>{date.toLocaleDateString('en-US',{weekday:'short'})} {date.getDate()}</div>
            <div className="space-y-1.5">
              {dayBookings.map((b)=>(
                <div key={b.id} className={`rounded-md p-1.5 text-xs ${isPending(b) ? 'bg-warning/15' : 'bg-primary-soft'}`}>
                  <div className={`font-semibold ${isPending(b) ? 'text-warning' : 'text-link'}`}>{formatMeetingTime(b.start_time, timezone)}{isPending(b) ? ' · pending' : ''}</div>
                  <div className="truncate">{b.guest_name}</div>
                </div>
              ))}
              {dayBookings.length===0 && <div className="text-xs text-hint">Free</div>}
            </div>
          </div>
        );
      })}
    </div>
  );
}

function DayView({ date, bookings, timezone }) {
  const sorted = [...bookings].sort((a,b)=> new Date(a.start_time)-new Date(b.start_time));
  return (
    <div className="space-y-2">
      {sorted.length === 0 ? <EmptyState icon={CalIcon} title="No meetings today" description="Enjoy the free day." /> : sorted.map((b)=>(
        <div key={b.id} className="rounded-lg border border-border p-4 flex items-center gap-4">
          <span className={`w-3.5 h-3.5 rounded-full shrink-0 ${isPending(b) ? 'bg-warning' : 'bg-primary'}`} />
          <div>
            <div className="font-bold">{b.guest_name}</div>
            <div className="text-sm text-muted-foreground">{b.event_name} · {formatMeetingTime(b.start_time, timezone)}{isPending(b) ? ' · waiting for your approval' : ''}</div>
          </div>
        </div>
      ))}
    </div>
  );
}

function DayPanel({ date, bookings, timezone, onClose }) {
  const sorted = [...bookings].sort((a,b)=> new Date(a.start_time)-new Date(b.start_time));
  const ref = useRef(null);
  // on phones the panel opens below the month grid, out of view
  useEffect(() => {
    if (window.matchMedia('(max-width: 639px)').matches) ref.current?.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
  }, [date]);
  return (
    <div ref={ref} className="scroll-mb-24 rounded-xl border border-border bg-card shadow-card p-5">
      <div className="flex items-center justify-between mb-3">
        <h3 className="font-bold">{date.toLocaleDateString('en-US',{weekday:'long',month:'long',day:'numeric'})}</h3>
        <button onClick={onClose} className="text-sm font-semibold text-link hover:underline">Close</button>
      </div>
      {sorted.length === 0 ? <p className="text-sm text-muted-foreground">No meetings this day.</p> : (
        <div className="space-y-2">
          {sorted.map((b)=>(
            <div key={b.id} className="rounded-lg border border-border p-3 flex items-center gap-3">
              <span className={`w-3 h-3 rounded-full shrink-0 ${isPending(b) ? 'bg-warning' : 'bg-primary'}`} />
              <div>
                <div className="font-bold text-sm">{b.guest_name}</div>
                <div className="text-xs text-muted-foreground">{formatMeetingTime(b.start_time, timezone)} · {b.event_name}{isPending(b) ? ' · waiting for your approval' : ''}</div>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
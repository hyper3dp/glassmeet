import React, { useEffect, useState, useMemo } from 'react';
import { api } from '@/lib/localApi';
import { ChevronLeft, ChevronRight, Calendar as CalIcon, Zap } from 'lucide-react';
import { GlassButton, Spinner, EmptyState, PageHeader } from '@/components/glass';
import { formatMeetingTime } from '@/lib/whatsapp';
import { detectTimezone } from '@/lib/Availability.js';
import FindATime from '@/components/FindAtime.jsx';

// y-m-d of a local calendar cell, and of a booking in the host time zone
const cellKey = (d) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
const bookingKey = (iso, tz) => new Date(iso).toLocaleDateString('en-CA', { timeZone: tz });

export default function CalendarPage({ profile }) {
  const [view, setView] = useState('month'); // month | week | day
  const [cursor, setCursor] = useState(new Date());
  const [bookings, setBookings] = useState([]);
  const [loading, setLoading] = useState(true);
  const [selectedDay, setSelectedDay] = useState(null);
  const [showFindTime, setShowFindTime] = useState(false);
  const timezone = profile?.timezone || detectTimezone();

  useEffect(() => { load(); }, []);

  const load = async () => {
    try {
      const b = await api.entities.Booking.filter({ host_id: profile.id }, '-start_time', 200);
      setBookings(b.filter((x) => x.status === 'confirmed'));
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
            <button onClick={()=>{ setCursor(new Date()); setSelectedDay(null); }} className="h-9 px-4 rounded-full border border-input text-sm font-semibold transition-all duration-200 hover:bg-secondary">Today</button>
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

        {view === 'month' && <MonthView cursor={cursor} bookingsByDay={bookingsByDay} timezone={timezone} onSelect={(d)=>{ setSelectedDay(d); }} />}
        {view === 'week' && <WeekView cursor={cursor} bookingsByDay={bookingsByDay} timezone={timezone} />}
        {view === 'day' && <DayView date={cursor} bookings={bookingsByDay[cellKey(cursor)]||[]} timezone={timezone} />}
      </div>

      {selectedDay && (
        <DayPanel date={selectedDay} bookings={bookingsByDay[cellKey(selectedDay)]||[]} timezone={timezone} onClose={()=>setSelectedDay(null)} />
      )}

      <FindATime open={showFindTime} onClose={() => setShowFindTime(false)} profile={profile} />
    </div>
  );
}

function MonthView({ cursor, bookingsByDay, timezone, onSelect }) {
  const year = cursor.getFullYear(), month = cursor.getMonth();
  const first = new Date(year, month, 1);
  const startDay = first.getDay();
  const daysInMonth = new Date(year, month + 1, 0).getDate();
  const cells = [];
  for (let i = 0; i < startDay; i++) cells.push(null);
  for (let d = 1; d <= daysInMonth; d++) cells.push(new Date(year, month, d));
  const today = new Date(); today.setHours(0,0,0,0);

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
          return (
            <button key={i} onClick={()=>onSelect(date)} className="bg-card p-1.5 sm:p-2 min-h-[72px] sm:min-h-[96px] text-left flex flex-col gap-1 transition-all duration-200 hover:bg-secondary">
              <span className={`w-7 h-7 rounded-full text-sm font-semibold tabular flex items-center justify-center ${isToday?'bg-primary text-primary-foreground':''}`}>{date.getDate()}</span>
              <div className="flex flex-col gap-0.5 overflow-hidden">
                {dayBookings.slice(0,2).map((b)=>(
                  <span key={b.id} className="text-[11px] font-semibold truncate text-link bg-primary-soft rounded px-1.5 py-0.5">{formatMeetingTime(b.start_time, timezone)} {b.guest_name}</span>
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

function WeekView({ cursor, bookingsByDay, timezone }) {
  const start = new Date(cursor); start.setDate(start.getDate() - start.getDay());
  const days = Array.from({length:7}, (_,i) => { const d = new Date(start); d.setDate(d.getDate()+i); return d; });
  const today = new Date(); today.setHours(0,0,0,0);
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
                <div key={b.id} className="bg-primary-soft rounded-md p-1.5 text-xs">
                  <div className="font-semibold text-link">{formatMeetingTime(b.start_time, timezone)}</div>
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
          <span className="w-3.5 h-3.5 rounded-full bg-primary shrink-0" />
          <div>
            <div className="font-bold">{b.guest_name}</div>
            <div className="text-sm text-muted-foreground">{b.event_name} · {formatMeetingTime(b.start_time, timezone)}</div>
          </div>
        </div>
      ))}
    </div>
  );
}

function DayPanel({ date, bookings, timezone, onClose }) {
  const sorted = [...bookings].sort((a,b)=> new Date(a.start_time)-new Date(b.start_time));
  return (
    <div className="rounded-xl border border-border bg-card shadow-card p-5">
      <div className="flex items-center justify-between mb-3">
        <h3 className="font-bold">{date.toLocaleDateString('en-US',{weekday:'long',month:'long',day:'numeric'})}</h3>
        <button onClick={onClose} className="text-sm font-semibold text-link hover:underline">Close</button>
      </div>
      {sorted.length === 0 ? <p className="text-sm text-muted-foreground">No meetings this day.</p> : (
        <div className="space-y-2">
          {sorted.map((b)=>(
            <div key={b.id} className="rounded-lg border border-border p-3 flex items-center gap-3">
              <span className="w-3 h-3 rounded-full bg-primary shrink-0" />
              <div>
                <div className="font-bold text-sm">{b.guest_name}</div>
                <div className="text-xs text-muted-foreground">{formatMeetingTime(b.start_time, timezone)} · {b.event_name}</div>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
import React, { useEffect, useState, useMemo } from 'react';
import { api } from '@/lib/localApi';
import { ChevronLeft, ChevronRight, Clock, Calendar as CalIcon, Zap } from 'lucide-react';
import { GlassCard, GlassButton, Spinner, EmptyState } from '@/components/glass';
import { formatMeetingDate, formatMeetingTime } from '@/lib/whatsapp';
import { detectTimezone } from '@/lib/Availability.js';
import FindATime from '@/components/FindAtime.jsx';

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
      const key = b.start_time.slice(0, 10);
      (map[key] = map[key] || []).push(b);
    }
    return map;
  }, [bookings]);

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
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl sm:text-3xl font-semibold tracking-tight">Calendar</h1>
          <p className="text-muted-foreground text-sm mt-1">Your meetings at a glance.</p>
        </div>
        <div className="flex gap-2">
          <GlassButton size="sm" onClick={() => setShowFindTime(true)}><Zap className="w-4 h-4" /> Find a Time</GlassButton>
          <div className="flex gap-1 glass rounded-full p-1">
            {['month','week','day'].map((v) => (
              <button key={v} onClick={()=>setView(v)} className={`px-3 py-1.5 rounded-full text-sm font-medium capitalize transition ${view===v?'accent-bg text-white':'text-muted-foreground'}`}>{v}</button>
            ))}
          </div>
        </div>
      </div>

      <GlassCard hover={false}>
        <div className="flex items-center justify-between mb-4">
          <h2 className="font-semibold">{title}</h2>
          <div className="flex gap-1">
            <button onClick={()=>move(-1)} className="w-8 h-8 rounded-lg glass flex items-center justify-center"><ChevronLeft className="w-4 h-4" /></button>
            <button onClick={()=>{ setCursor(new Date()); setSelectedDay(null); }} className="px-3 h-8 rounded-lg glass text-sm font-medium">Today</button>
            <button onClick={()=>move(1)} className="w-8 h-8 rounded-lg glass flex items-center justify-center"><ChevronRight className="w-4 h-4" /></button>
          </div>
        </div>

        {view === 'month' && <MonthView cursor={cursor} bookingsByDay={bookingsByDay} onSelect={(d)=>{ setSelectedDay(d); }} />}
        {view === 'week' && <WeekView cursor={cursor} bookingsByDay={bookingsByDay} timezone={timezone} />}
        {view === 'day' && <DayView date={cursor} bookings={bookingsByDay[cursor.toISOString().slice(0,10)]||[]} timezone={timezone} />}
      </GlassCard>

      {selectedDay && (
        <DayPanel date={selectedDay} bookings={bookingsByDay[selectedDay.toISOString().slice(0,10)]||[]} timezone={timezone} onClose={()=>setSelectedDay(null)} />
      )}

      <FindATime open={showFindTime} onClose={() => setShowFindTime(false)} profile={profile} />
    </div>
  );
}

function MonthView({ cursor, bookingsByDay, onSelect }) {
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
          <div key={d} className="text-center text-xs font-medium text-muted-foreground py-2">{d}</div>
        ))}
      </div>
      <div className="grid grid-cols-7 gap-1.5">
        {cells.map((date, i) => {
          if (!date) return <div key={i} />;
          const key = date.toISOString().slice(0,10);
          const dayBookings = bookingsByDay[key] || [];
          const isToday = date.getTime() === today.getTime();
          return (
            <button key={i} onClick={()=>onSelect(date)} className={`glass-button rounded-xl p-2 min-h-[64px] text-left flex flex-col gap-1 ${isToday?'accent-border':''}`}>
              <span className={`text-sm font-medium ${isToday?'accent-text':''}`}>{date.getDate()}</span>
              <div className="flex flex-col gap-0.5 overflow-hidden">
                {dayBookings.slice(0,2).map((b)=>(
                  <span key={b.id} className="text-[10px] truncate accent-text bg-accent/10 rounded px-1 py-0.5">{formatMeetingTime(b.start_time,'UTC')} {b.guest_name}</span>
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
        const key = date.toISOString().slice(0,10);
        const dayBookings = (bookingsByDay[key]||[]).sort((a,b)=> new Date(a.start_time)-new Date(b.start_time));
        const isToday = date.getTime() === today.getTime();
        return (
          <div key={i} className={`glass rounded-xl p-3 min-h-[120px] ${isToday?'accent-border':''}`}>
            <div className="text-xs font-medium text-muted-foreground mb-2">{date.toLocaleDateString('en-US',{weekday:'short'})} {date.getDate()}</div>
            <div className="space-y-1.5">
              {dayBookings.map((b)=>(
                <div key={b.id} className="bg-accent/10 rounded-lg p-1.5 text-xs">
                  <div className="font-medium accent-text">{formatMeetingTime(b.start_time, timezone)}</div>
                  <div className="truncate">{b.guest_name}</div>
                </div>
              ))}
              {dayBookings.length===0 && <div className="text-xs text-muted-foreground">Free</div>}
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
        <div key={b.id} className="glass rounded-xl p-4 flex items-center gap-4">
          <div className="w-12 h-12 rounded-xl accent-bg flex items-center justify-center text-white"><Clock className="w-5 h-5" /></div>
          <div>
            <div className="font-medium">{b.guest_name}</div>
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
    <GlassCard hover={false}>
      <div className="flex items-center justify-between mb-3">
        <h3 className="font-semibold">{date.toLocaleDateString('en-US',{weekday:'long',month:'long',day:'numeric'})}</h3>
        <button onClick={onClose} className="text-sm accent-text">Close</button>
      </div>
      {sorted.length === 0 ? <p className="text-sm text-muted-foreground">No meetings this day.</p> : (
        <div className="space-y-2">
          {sorted.map((b)=>(
            <div key={b.id} className="glass rounded-xl p-3 flex items-center justify-between">
              <div>
                <div className="font-medium text-sm">{b.guest_name}</div>
                <div className="text-xs text-muted-foreground">{formatMeetingTime(b.start_time, timezone)} · {b.event_name}</div>
              </div>
            </div>
          ))}
        </div>
      )}
    </GlassCard>
  );
}
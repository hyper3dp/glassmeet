import React, { useEffect, useState, useMemo, useRef } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import { toast } from 'sonner';
import { api } from '@/lib/localApi';
import { ChevronLeft, ChevronRight, Calendar as CalIcon, Plus, Trash2, X, Zap } from 'lucide-react';
import { GlassButton, GlassInput, GlassLabel, Spinner, LoadError, EmptyState, PageHeader, TimeSelect } from '@/components/glass';
import { formatMeetingTime } from '@/lib/whatsapp';
import { detectTimezone, dateInZone } from '@/lib/Availability.js';
import { cn } from '@/lib/utils';
import FindATime from '@/components/FindAtime.jsx';
import DatePicker from '@/components/DatePicker.jsx';
import { Dialog, DialogContent, DialogTitle } from '@/components/ui/dialog';
import { Switch } from '@/components/ui/switch';
import { holidayMap } from '@/lib/holidays.js';
import { onlyTitle } from '@/lib/inputRules';

// y-m-d of a local calendar cell, and of a booking in the host time zone
const cellKey = (d) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
// one formatter per zone: building one per booking is slow with a thousand of them
const keyFormatters = {};
const bookingKey = (iso, tz) => (keyFormatters[tz] || (keyFormatters[tz] = new Intl.DateTimeFormat('en-CA', { timeZone: tz }))).format(new Date(iso));
const minuteFormatters = {};
const minuteOfDay = (iso, tz) => {
  const f = minuteFormatters[tz] || (minuteFormatters[tz] = new Intl.DateTimeFormat('en-GB', { timeZone: tz, hourCycle: 'h23', hour: '2-digit', minute: '2-digit' }));
  const [h, m] = f.format(new Date(iso)).split(':').map(Number);
  return h * 60 + m;
};

// today's date in the host's zone (the browser may be somewhere else)
const todayIn = (tz) => dateInZone(Date.now(), tz);
const isPending = (b) => b.approval_status === 'pending';
const WEEKDAYS = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
const toMinutes = (t) => { const [h, m] = (t || '0:0').split(':').map(Number); return h * 60 + m; };
// "17:00" -> "5:00 PM" ("24:00", the end of the day, -> "12:00 AM")
const clock = (t) => {
  const minutes = toMinutes(t);
  return new Date(2000, 0, 1, Math.floor(minutes / 60), minutes % 60).toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit' });
};
const longDate = (d) => d.toLocaleDateString('en-US', { weekday: 'long', month: 'long', day: 'numeric' });
const countLabel = (n, one) => `${n} ${one}${n === 1 ? '' : 's'}`;

// Everything on a day, in one shape and in time order: all-day items first
const dayEntries = (bookings = [], items = [], tz) => [
  ...items.map((e) => ({
    id: e.id,
    kind: 'item',
    minute: e.start_time ? toMinutes(e.start_time) : -1,
    time: e.start_time ? clock(e.start_time) : 'All day',
    end: e.start_time ? clock(e.end_time) : '',
    title: e.label || 'Blocked time',
    detail: 'Private. Guests can’t book this time.',
    exception: e,
  })),
  ...bookings.map((b) => ({
    id: b.id,
    kind: isPending(b) ? 'pending' : 'meeting',
    minute: minuteOfDay(b.start_time, tz),
    time: formatMeetingTime(b.start_time, tz),
    end: b.end_time ? formatMeetingTime(b.end_time, tz) : '',
    title: b.guest_name,
    detail: `${b.event_name || 'Meeting'}${isPending(b) ? ' · waiting for your approval' : ''}`,
    to: `/bookings?id=${b.id}`,
  })),
].sort((a, b) => a.minute - b.minute);

const CHIP = {
  meeting: 'bg-primary-soft text-link',
  pending: 'bg-warning/15 text-warning',
  item: 'bg-secondary text-muted-foreground',
};
const DOT = { meeting: 'bg-primary', pending: 'bg-warning', item: 'bg-hint' };

export default function CalendarPage({ profile }) {
  const timezone = profile?.timezone || detectTimezone();
  const [view, setView] = useState('month'); // month | week | day
  const [cursor, setCursor] = useState(() => todayIn(timezone));
  const [selectedDay, setSelectedDay] = useState(() => todayIn(timezone));
  const [bookings, setBookings] = useState([]);
  const [exceptions, setExceptions] = useState([]);
  const [holidays, setHolidays] = useState({}); // { 'YYYY-MM-DD': name } when the host blocks holidays
  const [loading, setLoading] = useState(true);
  const [adding, setAdding] = useState(null); // the date the add form opens on
  // the command palette's "Find a time" links here with ?find=true
  const [showFindTime, setShowFindTime] = useState(false);
  const [searchParams, setSearchParams] = useSearchParams();
  // read on every visit (also when already on this page), then cleared so a refresh doesn't reopen it
  useEffect(() => {
    if (searchParams.get('find') !== 'true') return;
    setShowFindTime(true);
    setSearchParams((p) => { const next = new URLSearchParams(p); next.delete('find'); return next; }, { replace: true });
  }, [searchParams]);

  useEffect(() => { load(); }, []);
  useEffect(() => {
    api.holidays.forRegion(profile?.holidays).then((h) => setHolidays(holidayMap(h))).catch(() => setHolidays({}));
  }, [profile?.holidays]);

  const [loadFailed, setLoadFailed] = useState(false);
  const load = async () => {
    setLoadFailed(false);
    try {
      const [b, e] = await Promise.all([
        api.entities.Booking.filter({ host_id: profile.id }, '-start_time', 1000, 'id, guest_name, event_name, start_time, end_time, status, approval_status'),
        api.entities.AvailabilityException.filter({ created_by_id: profile.id }, 'date'),
      ]);
      // everything still on (confirmed, completed, and requests awaiting approval)
      setBookings(b.filter((x) => x.status !== 'cancelled'));
      setExceptions(e);
    } catch {
      setLoadFailed(true);
    }
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

  // what the host added or blocked; custom working hours belong to the Availability page
  const itemsByDay = useMemo(() => {
    const map = {};
    for (const e of exceptions) {
      if (e.type !== 'blocked') continue;
      (map[e.date] = map[e.date] || []).push(e);
    }
    return map;
  }, [exceptions]);

  const entriesFor = (date) => {
    const key = cellKey(date);
    return dayEntries(bookingsByDay[key], itemsByDay[key], timezone);
  };

  const move = (dir) => {
    const d = new Date(cursor);
    // from the 1st, so Oct 31 + 1 month is November rather than Dec 1
    if (view === 'month') { d.setDate(1); d.setMonth(d.getMonth() + dir); }
    if (view === 'week') d.setDate(d.getDate() + dir * 7);
    if (view === 'day') d.setDate(d.getDate() + dir);
    setCursor(d);
  };

  const title = useMemo(() => {
    if (view === 'month') return cursor.toLocaleDateString('en-US', { month: 'long', year: 'numeric' });
    if (view === 'day') return longDate(cursor);
    const start = new Date(cursor); start.setDate(start.getDate() - start.getDay());
    const end = new Date(start); end.setDate(end.getDate() + 6);
    return `${start.toLocaleDateString('en-US', { month: 'short', day: 'numeric' })} – ${end.toLocaleDateString('en-US', { month: 'short', day: 'numeric' })}`;
  }, [cursor, view]);

  const monthMeetings = useMemo(() => {
    const prefix = cellKey(cursor).slice(0, 7);
    return Object.entries(bookingsByDay).reduce((sum, [key, list]) => (key.startsWith(prefix) ? sum + list.length : sum), 0);
  }, [bookingsByDay, cursor]);

  const today = todayIn(timezone);
  const openAdd = (date) => setAdding(cellKey(date < today ? today : date));

  const addItem = async (value) => {
    const saved = await api.entities.AvailabilityException.create(value);
    setExceptions((list) => [...list, saved]);
    setAdding(null);
    const [y, m, d] = value.date.split('-').map(Number);
    const date = new Date(y, m - 1, d);
    setSelectedDay(date);
    setCursor(date);
    toast.success(`Added ${value.label} to your calendar.`);
  };

  const removeItem = async (exception) => {
    setExceptions((list) => list.filter((e) => e.id !== exception.id));
    try {
      await api.entities.AvailabilityException.delete(exception.id);
    } catch (e) {
      setExceptions((list) => [...list, exception]);
      toast.error(`Could not remove it. ${e?.message || ''}`.trim());
    }
  };

  const openDay = (date) => { setCursor(date); setSelectedDay(date); setView('day'); };

  if (loading) return <div className="flex justify-center py-24"><Spinner /></div>;
  if (loadFailed) return <LoadError what="Your calendar" onRetry={() => { setLoading(true); load(); }} />;

  return (
    <div className="space-y-6 animate-fade-in">
      <PageHeader
        title="Calendar"
        actions={(
          <>
            <GlassButton type="button" onClick={() => setShowFindTime(true)}><Zap className="w-4 h-4" /> Find a time</GlassButton>
            <GlassButton type="button" variant="primary" onClick={() => openAdd(view === 'month' ? selectedDay : cursor)}><Plus className="w-4 h-4" /> Add to calendar</GlassButton>
          </>
        )}
      />

      <div className="rounded-xl border border-border bg-card shadow-card">
        <div className="flex flex-wrap items-center justify-between gap-x-4 gap-y-3 border-b border-border px-4 py-3.5 sm:px-5">
          <div className="flex min-w-0 items-center gap-1.5">
            <button type="button" onClick={() => { setCursor(today); setSelectedDay(today); }} className="mr-1 h-9 rounded-full border border-input px-4 text-sm font-semibold transition-all duration-200 hover:bg-secondary">Today</button>
            <button type="button" onClick={() => move(-1)} aria-label="Previous" className="flex h-9 w-9 items-center justify-center rounded-full text-muted-foreground transition-all duration-200 hover:bg-secondary hover:text-foreground"><ChevronLeft className="h-5 w-5" /></button>
            <button type="button" onClick={() => move(1)} aria-label="Next" className="flex h-9 w-9 items-center justify-center rounded-full text-muted-foreground transition-all duration-200 hover:bg-secondary hover:text-foreground"><ChevronRight className="h-5 w-5" /></button>
            <h2 aria-live="polite" className="ml-1 truncate text-[17px] font-bold tabular">{title}</h2>
            {view === 'month' && <span className="ml-2 hidden whitespace-nowrap text-sm text-muted-foreground md:inline tabular">{countLabel(monthMeetings, 'meeting')}</span>}
          </div>
          <div role="tablist" aria-label="Calendar view" className="flex rounded-full bg-secondary p-0.5">
            {['month', 'week', 'day'].map((v) => (
              <button key={v} type="button" role="tab" aria-selected={view === v} onClick={() => { if (v === 'day' && view === 'month') setCursor(selectedDay); setView(v); }} className={cn('h-8 rounded-full px-4 text-sm font-semibold capitalize transition-all duration-200', view === v ? 'bg-card text-link shadow-card' : 'text-muted-foreground hover:text-foreground')}>{v}</button>
            ))}
          </div>
        </div>

        {view === 'month' && (
          <div className="flex flex-col xl:flex-row">
            <div className="min-w-0 flex-1 p-3 sm:p-5">
              <MonthView cursor={cursor} today={today} entriesFor={entriesFor} holidays={holidays} selectedDay={selectedDay} onSelect={(date, jump) => { setSelectedDay(date); if (jump) setCursor(date); }} />
            </div>
            <DayAgenda date={selectedDay} holiday={holidays[cellKey(selectedDay)]} entries={entriesFor(selectedDay)} onAdd={() => openAdd(selectedDay)} onRemove={removeItem} />
          </div>
        )}
        {view === 'week' && <WeekView cursor={cursor} today={today} entriesFor={entriesFor} holidays={holidays} onOpenDay={openDay} />}
        {view === 'day' && (
          <div className="mx-auto max-w-2xl p-4 sm:p-6">
            {holidays[cellKey(cursor)] && <p className="mb-4 rounded-lg bg-secondary px-4 py-3 text-sm font-semibold text-muted-foreground">{holidays[cellKey(cursor)]} · bookings are closed</p>}
            {entriesFor(cursor).length === 0
              ? <EmptyState icon={CalIcon} title="Nothing on this day" description="Meetings and anything you add show up here." action={<GlassButton type="button" onClick={() => openAdd(cursor)}><Plus className="h-4 w-4" /> Add to calendar</GlassButton>} />
              : <AgendaList entries={entriesFor(cursor)} onRemove={removeItem} />}
          </div>
        )}
      </div>

      <FindATime open={showFindTime} onClose={() => setShowFindTime(false)} profile={profile} />
      {adding && <AddToCalendar date={adding} today={cellKey(today)} onAdd={addItem} onClose={() => setAdding(null)} />}
    </div>
  );
}

function MonthView({ cursor, today, entriesFor, holidays, selectedDay, onSelect }) {
  const year = cursor.getFullYear();
  const month = cursor.getMonth();
  const lead = new Date(year, month, 1).getDay();
  const days = new Date(year, month + 1, 0).getDate();
  // whole weeks: the neighbouring months' days fill the first and last rows
  const cells = Array.from({ length: Math.ceil((lead + days) / 7) * 7 }, (_, i) => new Date(year, month, i - lead + 1));
  const selectedKey = cellKey(selectedDay);

  return (
    <div>
      <div className="mb-1.5 grid grid-cols-7">
        {WEEKDAYS.map((d) => <div key={d} className="py-1.5 text-center text-xs font-semibold text-muted-foreground">{d}</div>)}
      </div>
      <div className="grid grid-cols-7 gap-px overflow-hidden rounded-lg border border-border bg-border">
        {cells.map((date) => {
          const key = cellKey(date);
          const inMonth = date.getMonth() === month;
          const entries = entriesFor(date);
          const isToday = date.getTime() === today.getTime();
          const isSelected = key === selectedKey;
          const holiday = holidays[key];
          const shown = entries.slice(0, holiday ? 1 : 2);
          const extra = entries.length - shown.length;
          return (
            <button
              key={key}
              type="button"
              onClick={() => onSelect(date, !inMonth)}
              aria-pressed={isSelected}
              aria-label={`${longDate(date)}, ${countLabel(entries.length, 'item')}${holiday ? `, ${holiday}` : ''}`}
              className={cn(
                'flex min-h-[56px] flex-col items-center gap-1 p-1 text-left transition-all duration-200 focus-visible:relative focus-visible:z-10 sm:min-h-[104px] sm:items-stretch sm:p-1.5',
                isSelected ? 'bg-primary-soft' : inMonth ? 'bg-card hover:bg-secondary' : 'bg-background hover:bg-secondary',
              )}
            >
              <span className={cn(
                'flex h-7 w-7 shrink-0 items-center justify-center rounded-full text-sm font-semibold tabular',
                isToday ? 'bg-primary text-primary-foreground' : isSelected ? 'text-link' : !inMonth && 'font-normal text-hint',
              )}>{date.getDate()}</span>
              {/* phones: a dot per entry (tap the day for the list); wider: time and name */}
              {(entries.length > 0 || holiday) && (
                <span className="flex items-center gap-0.5 sm:hidden" aria-hidden="true">
                  {holiday && <span className="h-1.5 w-1.5 rounded-full bg-hint" />}
                  {entries.slice(0, 3).map((e) => <span key={e.id} className={cn('h-1.5 w-1.5 rounded-full', DOT[e.kind])} />)}
                </span>
              )}
              <span className="hidden min-w-0 flex-col gap-0.5 sm:flex">
                {holiday && <span title={holiday} className="truncate rounded px-1.5 py-0.5 text-xs font-semibold bg-secondary text-muted-foreground">{holiday}</span>}
                {shown.map((e) => (
                  <span key={e.id} title={`${e.time} ${e.title}`} className={cn('truncate rounded px-1.5 py-0.5 text-xs font-semibold', CHIP[e.kind], isSelected && 'bg-card')}>
                    <span className="font-normal tabular">{e.minute >= 0 ? e.time.replace(':00', '').replace(' ', '').toLowerCase() : ''}</span> {e.title}
                  </span>
                ))}
                {extra > 0 && <span className="px-1.5 text-xs font-semibold text-muted-foreground tabular">{extra} more</span>}
              </span>
            </button>
          );
        })}
      </div>
    </div>
  );
}

function WeekView({ cursor, today, entriesFor, holidays, onOpenDay }) {
  const start = new Date(cursor); start.setDate(start.getDate() - start.getDay());
  const days = Array.from({ length: 7 }, (_, i) => new Date(start.getFullYear(), start.getMonth(), start.getDate() + i));
  return (
    <div className="grid grid-cols-1 divide-y divide-border sm:grid-cols-7 sm:divide-x sm:divide-y-0">
      {days.map((date, i) => {
        const key = cellKey(date);
        const entries = entriesFor(date);
        const isToday = date.getTime() === today.getTime();
        return (
          <div key={key} className="flex min-w-0 gap-3 p-3 sm:block sm:min-h-[360px] sm:p-2.5">
            <button type="button" onClick={() => onOpenDay(date)} aria-label={`Open ${longDate(date)}`} className="flex w-11 shrink-0 flex-col items-center rounded-lg py-1 transition-all duration-200 hover:bg-secondary sm:mb-2.5 sm:w-full">
              <span className="text-xs font-semibold text-muted-foreground">{WEEKDAYS[i]}</span>
              <span className={cn('mt-0.5 flex h-8 w-8 items-center justify-center rounded-full text-[15px] font-bold tabular', isToday && 'bg-primary text-primary-foreground')}>{date.getDate()}</span>
            </button>
            <div className="min-w-0 flex-1 space-y-1.5">
              {holidays[key] && <div title={holidays[key]} className="truncate rounded-md bg-secondary p-1.5 text-xs font-semibold text-muted-foreground">{holidays[key]}</div>}
              {entries.map((e) => {
                const body = (
                  <>
                    <div className="truncate text-xs font-semibold tabular">{e.time}</div>
                    <div className="truncate text-xs text-foreground">{e.title}</div>
                  </>
                );
                return e.to
                  ? <Link key={e.id} to={e.to} className={cn('block rounded-md p-1.5 transition-all duration-200 hover:opacity-80', CHIP[e.kind])}>{body}</Link>
                  : <div key={e.id} className={cn('rounded-md p-1.5', CHIP[e.kind])}>{body}</div>;
              })}
              {entries.length === 0 && !holidays[key] && <div className="py-2 text-xs text-muted-foreground sm:hidden">Nothing on</div>}
            </div>
          </div>
        );
      })}
    </div>
  );
}

function AgendaList({ entries, onRemove }) {
  return (
    <ul className="divide-y divide-border">
      {entries.map((e) => {
        const body = (
          <>
            <span className="w-[4.75rem] shrink-0 text-sm font-semibold tabular">
              {e.time}
              {e.end && <span className="block text-xs font-normal text-muted-foreground">{e.end}</span>}
            </span>
            <span className={cn('mt-1.5 h-2 w-2 shrink-0 rounded-full', DOT[e.kind])} aria-hidden="true" />
            <span className="min-w-0 flex-1">
              <span className="block truncate text-sm font-bold">{e.title}</span>
              <span className="block text-xs text-muted-foreground">{e.detail}</span>
            </span>
          </>
        );
        return (
          <li key={e.id} className="flex items-start">
            {e.to ? (
              <Link to={e.to} className="flex min-w-0 flex-1 items-start gap-2.5 rounded-lg px-1.5 py-3 transition-all duration-200 hover:bg-secondary">{body}</Link>
            ) : (
              <>
                <div className="flex min-w-0 flex-1 items-start gap-2.5 px-1.5 py-3">{body}</div>
                <button type="button" onClick={() => onRemove(e.exception)} aria-label={`Remove ${e.title}`} title="Remove" className="my-2 flex h-9 w-9 shrink-0 items-center justify-center rounded-full text-muted-foreground transition-all duration-200 hover:bg-secondary hover:text-destructive"><Trash2 className="h-4 w-4" /></button>
              </>
            )}
          </li>
        );
      })}
    </ul>
  );
}

// The picked day beside the month (below it on smaller screens)
function DayAgenda({ date, holiday, entries, onAdd, onRemove }) {
  const ref = useRef(null);
  const opened = useRef(false);
  // phones: the list opens below the month grid, out of view; not on arrival, only when a day is picked
  useEffect(() => {
    if (opened.current && window.matchMedia('(max-width: 639px)').matches) ref.current?.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
    opened.current = true;
  }, [date]);
  return (
    <section ref={ref} aria-label={longDate(date)} className="scroll-mb-24 border-t border-border p-4 sm:p-5 xl:w-[320px] xl:shrink-0 xl:border-l xl:border-t-0">
      <div className="mb-2 flex items-start justify-between gap-3">
        <div className="min-w-0">
          <h3 className="font-bold">{longDate(date)}</h3>
          <p className="text-sm text-muted-foreground tabular">{entries.length ? countLabel(entries.length, 'item') : 'Nothing on this day'}</p>
        </div>
        <button type="button" onClick={onAdd} aria-label={`Add to calendar on ${longDate(date)}`} title="Add to calendar" className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full border border-input text-link transition-all duration-200 hover:bg-primary-soft"><Plus className="h-4 w-4" /></button>
      </div>
      {holiday && <p className="my-3 rounded-lg bg-secondary px-3 py-2 text-sm font-semibold text-muted-foreground">{holiday} · bookings are closed</p>}
      <AgendaList entries={entries} onRemove={onRemove} />
    </section>
  );
}

// Something of the host's own. It is saved as blocked time, so guests can't book over it, and it
// stays private: booking pages only ever get the times.
function AddToCalendar({ date: initialDate, today, onAdd, onClose }) {
  const [label, setLabel] = useState('');
  const [date, setDate] = useState(initialDate);
  const [allDay, setAllDay] = useState(false);
  const [startTime, setStartTime] = useState('09:00');
  const [endTime, setEndTime] = useState('10:00');
  const [error, setError] = useState('');
  const [saving, setSaving] = useState(false);

  const setStart = (value) => {
    setStartTime(value);
    // keep the range valid: a start past the end pushes the end along
    if (toMinutes(value) >= toMinutes(endTime)) {
      const next = Math.min(toMinutes(value) + 60, 24 * 60);
      setEndTime(`${String(Math.floor(next / 60)).padStart(2, '0')}:${String(next % 60).padStart(2, '0')}`);
    }
  };

  const save = async (e) => {
    e.preventDefault();
    const name = label.trim();
    if (!name) { setError('Give it a name.'); return; }
    if (!date) { setError('Pick a date.'); return; }
    if (!allDay && toMinutes(endTime) <= toMinutes(startTime)) { setError('End time must be after the start time.'); return; }
    setSaving(true);
    setError('');
    try {
      await onAdd({ date, type: 'blocked', start_time: allDay ? null : startTime, end_time: allDay ? null : endTime, label: name });
    } catch (err) {
      setError(err?.message || 'Could not add it. Try again.');
      setSaving(false);
    }
  };

  return (
    <Dialog open onOpenChange={(next) => { if (!next) onClose(); }}>
      <DialogContent showCloseButton={false} aria-describedby={undefined} className="sm:max-w-md p-6 block">
        <div className="mb-5 flex items-center justify-between">
          <DialogTitle>Add to calendar</DialogTitle>
          <button type="button" onClick={onClose} aria-label="Close" className="flex h-8 w-8 items-center justify-center rounded-full text-muted-foreground hover:bg-secondary"><X className="h-4 w-4" /></button>
        </div>
        <form onSubmit={save} className="space-y-5">
          <div>
            <GlassLabel htmlFor="add-label">Name</GlassLabel>
            <GlassInput id="add-label" autoFocus maxLength={60} value={label} onChange={(e) => setLabel(onlyTitle(e.target.value))} placeholder="Dentist, school run, focus time…" />
          </div>
          <div>
            <GlassLabel htmlFor="add-date">Date</GlassLabel>
            <DatePicker id="add-date" value={date} min={today} onChange={setDate} />
          </div>
          <label className="flex cursor-pointer items-center justify-between gap-3 text-sm font-semibold">
            All day
            <Switch checked={allDay} onCheckedChange={setAllDay} />
          </label>
          {!allDay && (
            <div className="grid grid-cols-[1fr_auto_1fr] items-end gap-3">
              <div className="min-w-0">
                <GlassLabel htmlFor="add-start">From</GlassLabel>
                <TimeSelect id="add-start" value={startTime} onChange={setStart} />
              </div>
              <span className="pb-3 text-muted-foreground" aria-hidden="true">–</span>
              <div className="min-w-0">
                <GlassLabel htmlFor="add-end">To</GlassLabel>
                <TimeSelect id="add-end" midnight value={endTime} onChange={(v) => setEndTime(toMinutes(v) === 0 ? '24:00' : v)} />
              </div>
            </div>
          )}
          <p className="text-sm text-muted-foreground">Only you see this. Guests can’t book this time.</p>
          {error && <p role="alert" className="text-sm text-destructive">{error}</p>}
          <div className="flex justify-end gap-2 pt-1">
            <GlassButton type="button" variant="ghost" onClick={onClose}>Cancel</GlassButton>
            <GlassButton type="submit" variant="primary" disabled={saving}>{saving ? 'Adding…' : 'Add'}</GlassButton>
          </div>
        </form>
      </DialogContent>
    </Dialog>
  );
}

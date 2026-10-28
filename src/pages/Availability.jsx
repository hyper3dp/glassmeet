import React, { useEffect, useRef, useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import { toast } from 'sonner';
import { api } from '@/lib/localApi';
import { Plus, Trash2, CalendarOff, X, Globe, RefreshCw } from 'lucide-react';
import { GlassButton, GlassInput, GlassLabel, Spinner, LoadError, PageHeader, Tabs, TimeSelect, SaveStatus } from '@/components/glass';
import { formatDate } from '@/lib/Availability.js';
import { Dialog, DialogContent, DialogTitle } from '@/components/ui/dialog';
import { Checkbox } from '@/components/ui/checkbox';
import DatePicker from '@/components/DatePicker.jsx';
import HolidaySettings from '@/components/HolidaySettings.jsx';

const DAYS = ['Sunday','Monday','Tuesday','Wednesday','Thursday','Friday','Saturday'];

// "17:00" -> "5:00pm" ("24:00", the end of the day, -> "12:00am")
const fmt = (t) => {
  if (!t) return '';
  const [h, m] = t.split(':').map(Number);
  return `${h % 12 || 12}:${String(m).padStart(2, '0')}${h % 24 < 12 ? 'am' : 'pm'}`;
};
const DAY_END = 24 * 60; // an end time may be midnight, stored as "24:00"
const toMin = (t) => { const [h, m] = (t || '0:0').split(':').map(Number); return h * 60 + m; };
const fromMin = (n) => `${String(Math.floor(n / 60)).padStart(2, '0')}:${String(n % 60).padStart(2, '0')}`;
let tempSeq = 0;
const tempId = () => `tmp-${Date.now()}-${tempSeq++}`;

// Where a day's next range goes: an hour after its last one ends, for an hour (shorter near
// midnight, or right after it when there's no room for the gap). null: the day is full.
const nextRange = (dayRules) => {
  const lastEnd = Math.max(0, ...dayRules.map((r) => toMin(r.end_time)));
  if (lastEnd >= DAY_END) return null;
  const start = lastEnd + 60 < DAY_END ? lastEnd + 60 : lastEnd;
  return { start_time: fromMin(start), end_time: fromMin(Math.min(start + 60, DAY_END)) };
};

export default function Availability({ profile, updateProfile }) {
  const [rules, setRules] = useState([]);
  const [exceptions, setExceptions] = useState([]);
  const [loading, setLoading] = useState(true);
  // the command palette's "Block time off" links here with ?block=true
  const [showExc, setShowExc] = useState(false);
  const [searchParams, setSearchParams] = useSearchParams();
  // read on every visit (also when already on this page), then cleared so a refresh doesn't reopen it
  useEffect(() => {
    if (searchParams.get('block') !== 'true') return;
    setShowExc(true);
    setSearchParams((p) => { const next = new URLSearchParams(p); next.delete('block'); return next; }, { replace: true });
  }, [searchParams]);
  const [saveState, setSaveState] = useState('idle');
  const [saveError, setSaveError] = useState('');
  const pending = useRef({});   // debounced rule updates, keyed by rule id
  const inflight = useRef(0);
  const queue = useRef(Promise.resolve()); // saves run one at a time, in the order they were made
  const failed = useRef(false);
  const removedTemp = useRef(new Set()); // date-specific rows deleted before their create finished
  const rulesRef = useRef(rules);
  rulesRef.current = rules;

  useEffect(() => {
    load();
    // leaving the page saves hour changes still waiting on their short delay
    return () => Object.entries(pending.current).forEach(([id, { timer, fields }]) => {
      clearTimeout(timer);
      api.entities.AvailabilityRule.update(id, fields).catch(() => {});
    });
  }, []);

  const [loadFailed, setLoadFailed] = useState(false);
  const load = async () => {
    setLoadFailed(false);
    try {
      const [r, e] = await Promise.all([
        api.entities.AvailabilityRule.filter({ created_by_id: profile.id }),
        api.entities.AvailabilityException.filter({ created_by_id: profile.id }, 'date'),
      ]);
      // First-run Mon–Fri 9–17 hours are seeded once by useProfile when the app loads.
      // Each day shows all its ranges, earliest first; reading never changes them.
      setRules([...r].sort((a, b) => toMin(a.start_time) - toMin(b.start_time)));
      setExceptions(e);
    } catch {
      setLoadFailed(true);
    }
    setLoading(false);
  };

  // Every change shows immediately; this queues the background save behind it. Saves run in
  // order so a delete can never land before the create it undoes. Only once the queue is empty
  // does a failure reload the saved state, so in-flight changes aren't overwritten by old data.
  const track = (work) => {
    inflight.current += 1;
    setSaveState('saving');
    queue.current = queue.current.then(async () => {
      try {
        await work();
      } catch (e) {
        failed.current = true;
        setSaveError(e?.message || 'Could not save your hours.');
      }
      inflight.current -= 1;
      if (inflight.current) return;
      if (failed.current) {
        failed.current = false;
        setSaveState('error');
        await load();
      } else {
        setSaveError('');
        setSaveState('saved');
      }
    });
  };

  // Turning a day on gives it 9:00–5:00; "+" adds another range after the day's last one
  const addRule = (dow, extra = false) => {
    const dayRules = rulesRef.current.filter((r) => r.day_of_week === dow);
    if (!extra && dayRules.length) return;
    const range = extra ? nextRange(dayRules) : { start_time: '09:00', end_time: '17:00' };
    if (!range) return;
    createRule({ day_of_week: dow, ...range });
  };

  const createRule = (values) => {
    const id = tempId();
    // rulesRef follows right away, so a quick second "+" sees this range too
    rulesRef.current = [...rulesRef.current, { id, ...values }];
    setRules((rs) => [...rs, { id, ...values }]);
    track(async () => {
      const saved = await api.entities.AvailabilityRule.create(values);
      // edits or a delete made while the row was saving
      const local = rulesRef.current.find((x) => x.id === id);
      if (!local) { await api.entities.AvailabilityRule.delete(saved.id); return; }
      setRules((rs) => rs.map((r) => (r.id === id ? { ...r, id: saved.id } : r)));
      if (local.start_time !== values.start_time || local.end_time !== values.end_time) {
        await api.entities.AvailabilityRule.update(saved.id, { start_time: local.start_time, end_time: local.end_time });
      }
    });
  };

  const updateRule = (id, field, value) => {
    // 12:00am as an end time means midnight at the end of the day
    if (field === 'end_time' && toMin(value) === 0) value = fromMin(DAY_END);
    // keep the range valid: moving one end past the other pushes the other end along
    const row = rulesRef.current.find((r) => r.id === id);
    const change = { [field]: value };
    if (row && field === 'start_time' && toMin(value) >= toMin(row.end_time)) change.end_time = fromMin(Math.min(toMin(value) + 60, DAY_END));
    if (row && field === 'end_time' && toMin(value) <= toMin(row.start_time)) change.start_time = fromMin(Math.max(toMin(value) - 60, 0));
    setRules((rs) => rs.map((r) => (r.id === id ? { ...r, ...change } : r)));
    if (String(id).startsWith('tmp-')) return; // saved with its final values once created
    const entry = pending.current[id] || { fields: {} };
    clearTimeout(entry.timer);
    entry.fields = { ...entry.fields, ...change };
    entry.timer = setTimeout(() => {
      const fields = entry.fields;
      delete pending.current[id];
      track(() => api.entities.AvailabilityRule.update(id, fields));
    }, 400);
    pending.current[id] = entry;
    setSaveState('saving');
  };

  const deleteRule = (id) => {
    setRules((rs) => rs.filter((r) => r.id !== id));
    clearTimeout(pending.current[id]?.timer);
    delete pending.current[id];
    if (!String(id).startsWith('tmp-')) track(() => api.entities.AvailabilityRule.delete(id));
  };

  const toggleDay = (dow, on) => {
    if (on) return addRule(dow);
    const removed = rulesRef.current.filter((r) => r.day_of_week === dow);
    removed.forEach((r) => deleteRule(r.id));
    // a day can hold split ranges that turning it back on (9–5) wouldn't bring back
    if (removed.length) {
      toast(`${DAYS[dow]} turned off`, {
        action: {
          label: 'Undo',
          onClick: () => {
            if (rulesRef.current.some((r) => r.day_of_week === dow)) return;
            removed.forEach(({ start_time, end_time }) => createRule({ day_of_week: dow, start_time, end_time }));
          },
        },
      });
    }
  };

  const addException = (exc) => {
    const tempId = `tmp-${Date.now()}`;
    setExceptions((es) => [...es, { id: tempId, ...exc }].sort((a, b) => a.date.localeCompare(b.date)));
    setShowExc(false);
    track(async () => {
      const saved = await api.entities.AvailabilityException.create(exc);
      // deleted while it was saving: remove the saved copy too
      if (removedTemp.current.has(tempId)) { await api.entities.AvailabilityException.delete(saved.id); return; }
      setExceptions((es) => es.map((e) => (e.id === tempId ? saved : e)));
    });
  };

  const deleteException = (id) => {
    if (String(id).startsWith('tmp-')) removedTemp.current.add(id);
    setExceptions((es) => es.filter((e) => e.id !== id));
    if (!String(id).startsWith('tmp-')) track(() => api.entities.AvailabilityException.delete(id));
  };

  if (loading) return <div className="flex justify-center py-24"><Spinner /></div>;
  // editing hours that never loaded would add duplicates of the ones already saved
  if (loadFailed) return <LoadError what="Your availability" onRetry={() => { setLoading(true); load(); }} />;

  return (
    <div className="animate-fade-in">
      <PageHeader title="Availability" actions={<SaveStatus state={saveState} />}>
        <Tabs tabs={[{ value: 'schedules', label: 'Schedules' }]} value="schedules" onChange={() => {}} />
      </PageHeader>

      <div className="rounded-xl border border-border bg-card shadow-card">
        <div className="flex flex-wrap items-center justify-between gap-3 border-b border-border px-6 py-5">
          <div>
            <div className="text-sm text-muted-foreground">Schedule</div>
            <div className="text-[17px] font-bold text-link">Working hours (default)</div>
          </div>
          <div className="text-sm text-muted-foreground flex items-center gap-1.5"><Globe className="w-4 h-4" /> {profile?.timezone || Intl.DateTimeFormat().resolvedOptions().timeZone}</div>
        </div>

        <div className="grid xl:grid-cols-2 [&>section]:min-w-0">
          {/* Weekly hours */}
          <section className="p-5 sm:p-6 xl:border-r border-border">
            <h2 className="text-[15px] font-bold flex items-center gap-2"><RefreshCw className="w-4 h-4 text-muted-foreground" /> Weekly hours</h2>
            <p className="mt-1 mb-5 text-sm text-muted-foreground">Set when you are typically available for meetings. Changes save automatically.</p>
            {saveError && (
              <p role="alert" className="mb-5 rounded-lg border border-destructive/30 bg-destructive/10 px-3.5 py-2.5 text-sm text-destructive">
                Your last change didn't save, so your saved hours were reloaded. {saveError}
              </p>
            )}
            <div className="space-y-4">
              {DAYS.map((day, dow) => {
                const dayRules = rules.filter((x) => x.day_of_week === dow);
                const on = dayRules.length > 0;
                const canAdd = on && !!nextRange(dayRules);
                const iconBtn = 'w-10 h-10 shrink-0 rounded-full flex items-center justify-center text-muted-foreground transition-all duration-200 hover:bg-secondary disabled:opacity-40 disabled:pointer-events-none';
                return (
                  <div key={dow} className="flex flex-wrap min-[420px]:flex-nowrap items-start gap-x-3 gap-y-2 min-h-10">
                    <label className="flex items-center gap-3 w-[74px] h-10 shrink-0 cursor-pointer">
                      <Checkbox checked={on} onCheckedChange={(v) => toggleDay(dow, v === true)} aria-label={`Available on ${day}`} />
                      <span className={`w-8 h-8 rounded-full text-xs font-bold flex items-center justify-center ${on ? 'bg-foreground text-background' : 'bg-secondary text-muted-foreground'}`} title={day}>{day[0]}</span>
                    </label>
                    {on ? (
                      <div className="basis-full min-[420px]:basis-auto flex-1 min-w-0 space-y-2">
                        {dayRules.map((r, i) => {
                          // "Monday start", or "Monday start, range 2" once a day has several
                          const name = (part) => (dayRules.length > 1 ? `${day} ${part}, range ${i + 1}` : `${day} ${part}`);
                          return (
                            <div key={r.id} className="flex items-center gap-1 sm:gap-2">
                              <TimeSelect value={r.start_time} onChange={(v) => updateRule(r.id, 'start_time', v)} aria-label={name('start')} className="h-10 flex-1 sm:flex-none sm:w-[120px] min-w-0" />
                              <span className="text-muted-foreground" aria-hidden="true">–</span>
                              <TimeSelect midnight value={r.end_time} onChange={(v) => updateRule(r.id, 'end_time', v)} aria-label={name('end')} className="h-10 flex-1 sm:flex-none sm:w-[120px] min-w-0" />
                              <button type="button" onClick={() => deleteRule(r.id)} aria-label={`Remove ${name('hours')}`} title="Remove" className={`${iconBtn} hover:text-destructive`}><X className="w-4 h-4" /></button>
                              {i === 0
                                ? <button type="button" onClick={() => addRule(dow, true)} disabled={!canAdd} aria-label={`Add hours on ${day}`} title="Add hours" className={`${iconBtn} hover:text-foreground`}><Plus className="w-4 h-4" /></button>
                                : <span className="w-10 shrink-0" aria-hidden="true" />}
                            </div>
                          );
                        })}
                      </div>
                    ) : (
                      <div className="h-10 flex items-center text-sm text-muted-foreground">Unavailable</div>
                    )}
                  </div>
                );
              })}
            </div>
          </section>

          {/* Date-specific hours */}
          <section className="p-5 sm:p-6 border-t xl:border-t-0 border-border">
            <div className="flex items-start justify-between gap-3">
              <div>
                <h2 className="text-[15px] font-bold flex items-center gap-2"><CalendarOff className="w-4 h-4 text-muted-foreground" /> Date-specific hours</h2>
                <p className="mt-1 text-sm text-muted-foreground">Adjust hours or block days off</p>
              </div>
              <GlassButton size="sm" type="button" onClick={() => setShowExc(true)}><Plus className="w-4 h-4" /> Hours</GlassButton>
            </div>
            <div className="mt-5">
              {exceptions.length === 0 ? (
                <p className="rounded-lg bg-secondary px-4 py-6 text-center text-sm text-muted-foreground">No date-specific hours yet. Add holidays, days off or one-off hours.</p>
              ) : (
                <ul className="divide-y divide-border rounded-lg border border-border">
                  {exceptions.map((e) => (
                    <li key={e.id} className="flex items-center justify-between gap-3 px-4 py-3">
                      <div className="min-w-0">
                        <div className="text-sm font-bold">{new Date(e.date + 'T00:00').toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric', year: 'numeric' })}</div>
                        <div className="text-sm text-muted-foreground truncate tabular">
                          {e.type === 'blocked' && !e.start_time ? 'Unavailable' : e.type === 'blocked' ? `Blocked ${fmt(e.start_time)} – ${fmt(e.end_time)}` : e.start_time ? `${fmt(e.start_time)} – ${fmt(e.end_time)}` : 'Available all day'}
                          {e.label ? ` · ${e.label}` : ''}
                        </div>
                      </div>
                      <button onClick={() => deleteException(e.id)} aria-label="Remove date" className="w-8 h-8 shrink-0 rounded-full flex items-center justify-center text-muted-foreground transition-all duration-200 hover:bg-secondary hover:text-destructive"><Trash2 className="w-4 h-4" /></button>
                    </li>
                  ))}
                </ul>
              )}
            </div>
          </section>
        </div>
      </div>

      <HolidaySettings profile={profile} updateProfile={updateProfile} />

      {showExc && <ExceptionModal onAdd={addException} onClose={() => setShowExc(false)} />}
    </div>
  );
}

function ExceptionModal({ onAdd, onClose }) {
  const [date, setDate] = useState(formatDate(new Date()));
  const [mode, setMode] = useState('blocked');
  const [startTime, setStartTime] = useState('09:00');
  const [endTime, setEndTime] = useState('17:00');
  const [label, setLabel] = useState('');
  const [error, setError] = useState('');

  const save = (e) => {
    e.preventDefault();
    if (!date) { setError('Pick a date.'); return; }
    if (mode !== 'blocked' && toMin(endTime) <= toMin(startTime)) { setError('End time must be after the start time.'); return; }
    onAdd(mode === 'blocked'
      ? { date, type: 'blocked', start_time: null, end_time: null, label: label.trim() || null }
      // 'hours' blocks part of the day and keeps the rest of the usual hours
      : { date, type: mode === 'hours' ? 'blocked' : 'available', start_time: startTime, end_time: endTime, label: label.trim() || null });
  };

  const pill = (value, text) => (
    <button type="button" aria-pressed={mode === value} onClick={() => { setMode(value); setError(''); }}
      className={`h-10 rounded-full border text-sm font-semibold transition-all duration-200 ${mode === value ? 'border-primary bg-primary-soft text-link' : 'border-input text-foreground hover:border-border-hover'}`}>
      {text}
    </button>
  );

  return (
    <Dialog open onOpenChange={(next) => { if (!next) onClose(); }}>
      <DialogContent showCloseButton={false} aria-describedby={undefined} className="sm:max-w-md p-6 block">
        <div className="flex items-center justify-between mb-5">
          <DialogTitle>Change hours on a date</DialogTitle>
          <button type="button" onClick={onClose} aria-label="Close" className="w-8 h-8 rounded-full flex items-center justify-center text-muted-foreground hover:bg-secondary"><X className="w-4 h-4" /></button>
        </div>
        <form onSubmit={save} className="space-y-5">
          <div>
            <GlassLabel htmlFor="exc-date">Date</GlassLabel>
            <DatePicker id="exc-date" value={date} min={formatDate(new Date())} onChange={setDate} />
          </div>
          <fieldset>
            <legend className="mb-2 text-sm font-semibold text-foreground">On this date</legend>
            <div className="grid grid-cols-3 gap-2">
              {pill('blocked', 'All day off')}
              {pill('hours', 'Block hours')}
              {pill('available', 'Custom hours')}
            </div>
            <p className="mt-2 text-sm text-muted-foreground">
              {mode === 'blocked' ? 'No bookings on this date.' : mode === 'hours' ? 'Close these hours; the rest of the day stays open.' : 'These hours replace your usual hours on this date.'}
            </p>
          </fieldset>
          {mode !== 'blocked' && (
            <div className="grid grid-cols-[1fr_auto_1fr] items-end gap-3">
              <div className="min-w-0">
                <GlassLabel htmlFor="exc-start">From</GlassLabel>
                <TimeSelect id="exc-start" value={startTime} onChange={setStartTime} />
              </div>
              <span className="pb-3 text-muted-foreground" aria-hidden="true">–</span>
              <div className="min-w-0">
                <GlassLabel htmlFor="exc-end">To</GlassLabel>
                <TimeSelect id="exc-end" midnight value={endTime} onChange={setEndTime} />
              </div>
            </div>
          )}
          <div>
            <GlassLabel htmlFor="exc-label">Label (optional)</GlassLabel>
            <GlassInput id="exc-label" maxLength={60} value={label} onChange={(e) => setLabel(e.target.value)} placeholder="Holiday, vacation…" />
          </div>
          {error && <p role="alert" className="text-sm text-destructive">{error}</p>}
          <div className="flex justify-end gap-2 pt-1">
            <GlassButton type="button" variant="ghost" onClick={onClose}>Cancel</GlassButton>
            <GlassButton type="submit" variant="primary">Apply</GlassButton>
          </div>
        </form>
      </DialogContent>
    </Dialog>
  );
}

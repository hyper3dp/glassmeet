import React, { useEffect, useRef, useState } from 'react';
import { api } from '@/lib/localApi';
import { Plus, Trash2, CalendarOff, X, Globe, RefreshCw } from 'lucide-react';
import { GlassButton, GlassInput, GlassLabel, Spinner, PageHeader, Tabs, TimeSelect, SaveStatus } from '@/components/glass';
import { formatDate } from '@/lib/Availability.js';
import { Dialog, DialogContent, DialogTitle } from '@/components/ui/dialog';

const DAYS = ['Sunday','Monday','Tuesday','Wednesday','Thursday','Friday','Saturday'];

// "17:00" -> "5:00pm"
const fmt = (t) => {
  if (!t) return '';
  const [h, m] = t.split(':').map(Number);
  return `${h % 12 || 12}:${String(m).padStart(2, '0')}${h < 12 ? 'am' : 'pm'}`;
};
const toMin = (t) => { const [h, m] = (t || '0:0').split(':').map(Number); return h * 60 + m; };
const fromMin = (n) => `${String(Math.floor(n / 60) % 24).padStart(2, '0')}:${String(n % 60).padStart(2, '0')}`;

export default function Availability({ profile }) {
  const [rules, setRules] = useState([]);
  const [exceptions, setExceptions] = useState([]);
  const [loading, setLoading] = useState(true);
  const [showExc, setShowExc] = useState(false);
  const [saveState, setSaveState] = useState('idle');
  const pending = useRef({});   // debounced rule updates, keyed by rule id
  const inflight = useRef(0);
  const rulesRef = useRef(rules);
  rulesRef.current = rules;

  useEffect(() => {
    load();
    return () => Object.values(pending.current).forEach(({ timer }) => clearTimeout(timer));
  }, []);

  const load = async () => {
    try {
      const [r, e] = await Promise.all([
        api.entities.AvailabilityRule.filter({ created_by_id: profile.id }),
        api.entities.AvailabilityException.filter({ created_by_id: profile.id }, 'date'),
      ]);
      // First-run Mon–Fri 9–17 hours are seeded once by useProfile when the app loads.
      setRules(r);
      setExceptions(e);
    } catch {}
    setLoading(false);
  };

  // Every change shows immediately; this tracks the background save behind it
  const track = async (work) => {
    inflight.current += 1;
    setSaveState('saving');
    try {
      await work();
      inflight.current -= 1;
      if (!inflight.current) setSaveState('saved');
    } catch {
      inflight.current -= 1;
      setSaveState('error');
      load();
    }
  };

  const addRule = (dow) => {
    const dayRules = rules.filter((r) => r.day_of_week === dow).sort((a, b) => toMin(a.end_time) - toMin(b.end_time));
    const last = dayRules[dayRules.length - 1];
    const start = last ? Math.min(toMin(last.end_time) + 60, 23 * 60) : 9 * 60;
    const values = { day_of_week: dow, start_time: fromMin(start), end_time: fromMin(last ? Math.min(start + 60, 23 * 60 + 45) : 17 * 60) };
    const tempId = `tmp-${Date.now()}`;
    setRules((rs) => [...rs, { id: tempId, ...values }]);
    track(async () => {
      const saved = await api.entities.AvailabilityRule.create(values);
      // edits or a delete made while the row was saving
      const local = rulesRef.current.find((x) => x.id === tempId);
      if (!local) { await api.entities.AvailabilityRule.delete(saved.id); return; }
      setRules((rs) => rs.map((r) => (r.id === tempId ? { ...r, id: saved.id } : r)));
      if (local.start_time !== values.start_time || local.end_time !== values.end_time) {
        await api.entities.AvailabilityRule.update(saved.id, { start_time: local.start_time, end_time: local.end_time });
      }
    });
  };

  const updateRule = (id, field, value) => {
    setRules((rs) => rs.map((r) => (r.id === id ? { ...r, [field]: value } : r)));
    if (String(id).startsWith('tmp-')) return; // saved with its final values once created
    const entry = pending.current[id] || { fields: {} };
    clearTimeout(entry.timer);
    entry.fields = { ...entry.fields, [field]: value };
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
    rules.filter((r) => r.day_of_week === dow).forEach((r) => deleteRule(r.id));
  };

  const addException = (exc) => {
    const tempId = `tmp-${Date.now()}`;
    setExceptions((es) => [...es, { id: tempId, ...exc }].sort((a, b) => a.date.localeCompare(b.date)));
    setShowExc(false);
    track(async () => {
      const saved = await api.entities.AvailabilityException.create(exc);
      setExceptions((es) => es.map((e) => (e.id === tempId ? saved : e)));
    });
  };

  const deleteException = (id) => {
    setExceptions((es) => es.filter((e) => e.id !== id));
    if (!String(id).startsWith('tmp-')) track(() => api.entities.AvailabilityException.delete(id));
  };

  if (loading) return <div className="flex justify-center py-24"><Spinner /></div>;

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
            <div className="space-y-4">
              {DAYS.map((day, dow) => {
                const dayRules = rules.filter((r) => r.day_of_week === dow).sort((a, b) => toMin(a.start_time) - toMin(b.start_time));
                const on = dayRules.length > 0;
                return (
                  <div key={dow} className="flex flex-wrap sm:flex-nowrap items-start gap-x-3 gap-y-2">
                    <label className="flex items-center gap-3 pt-1.5 w-[74px] shrink-0 cursor-pointer">
                      <input type="checkbox" checked={on} onChange={(e) => toggleDay(dow, e.target.checked)} className="w-4 h-4" aria-label={`Available on ${day}`} />
                      <span className={`w-8 h-8 rounded-full text-xs font-bold flex items-center justify-center ${on ? 'bg-foreground text-background' : 'bg-secondary text-muted-foreground'}`} title={day}>{day[0]}</span>
                    </label>
                    <div className="order-last sm:order-none basis-full sm:basis-auto flex-1 min-w-0 space-y-2">
                      {!on && <div className="sm:pt-2.5 text-sm text-muted-foreground">Unavailable</div>}
                      {dayRules.map((r) => (
                        <div key={r.id} className="flex items-center gap-2">
                          <TimeSelect value={r.start_time} onChange={(v) => updateRule(r.id, 'start_time', v)} aria-label={`${day} start`} className="h-10 flex-1 sm:flex-none sm:w-[120px] min-w-0" />
                          <span className="text-muted-foreground">–</span>
                          <TimeSelect value={r.end_time} onChange={(v) => updateRule(r.id, 'end_time', v)} aria-label={`${day} end`} className="h-10 flex-1 sm:flex-none sm:w-[120px] min-w-0" />
                          <button onClick={() => deleteRule(r.id)} aria-label="Remove interval" className="w-8 h-8 shrink-0 rounded-full flex items-center justify-center text-muted-foreground transition-all duration-200 hover:bg-secondary hover:text-foreground"><X className="w-4 h-4" /></button>
                        </div>
                      ))}
                    </div>
                    <button onClick={() => addRule(dow)} aria-label={`Add hours on ${day}`} className="ml-auto sm:ml-0 mt-1 w-8 h-8 shrink-0 rounded-full flex items-center justify-center text-muted-foreground transition-all duration-200 hover:bg-secondary hover:text-foreground"><Plus className="w-4 h-4" /></button>
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
                          {e.type === 'blocked' && !e.start_time ? 'Unavailable' : e.start_time ? `${fmt(e.start_time)} – ${fmt(e.end_time)}` : 'Available all day'}
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
    if (mode === 'available' && toMin(endTime) <= toMin(startTime)) { setError('End time must be after the start time.'); return; }
    onAdd(mode === 'blocked'
      ? { date, type: 'blocked', start_time: null, end_time: null, label: label.trim() || null }
      : { date, type: 'available', start_time: startTime, end_time: endTime, label: label.trim() || null });
  };

  const pill = (value, text) => (
    <button type="button" aria-pressed={mode === value} onClick={() => { setMode(value); setError(''); }}
      className={`h-10 rounded-full border text-sm font-semibold transition-all duration-200 ${mode === value ? 'border-primary bg-primary-soft text-link' : 'border-input text-foreground hover:border-border-hover'}`}>
      {text}
    </button>
  );

  return (
    <Dialog open onOpenChange={(next) => { if (!next) onClose(); }}>
      <DialogContent showCloseButton={false} aria-describedby={undefined} className="max-w-md max-h-[calc(100dvh-2rem)] overflow-y-auto p-6 block">
        <div className="flex items-center justify-between mb-5">
          <DialogTitle>Add date-specific hours</DialogTitle>
          <button type="button" onClick={onClose} aria-label="Close" className="w-8 h-8 rounded-full flex items-center justify-center text-muted-foreground hover:bg-secondary"><X className="w-4 h-4" /></button>
        </div>
        <form onSubmit={save} className="space-y-5">
          <div>
            <GlassLabel htmlFor="exc-date">Date</GlassLabel>
            <GlassInput
              id="exc-date" type="date" value={date} min={formatDate(new Date())} onChange={(e) => setDate(e.target.value)} required
              className="block appearance-none text-left leading-[2.75rem] [&::-webkit-date-and-time-value]:text-left [&::-webkit-date-and-time-value]:m-0"
            />
          </div>
          <fieldset>
            <legend className="mb-2 text-sm font-semibold text-foreground">On this date</legend>
            <div className="grid grid-cols-2 gap-2">
              {pill('blocked', 'Unavailable')}
              {pill('available', 'Custom hours')}
            </div>
          </fieldset>
          {mode === 'available' && (
            <div className="grid grid-cols-[1fr_auto_1fr] items-end gap-3">
              <div className="min-w-0">
                <GlassLabel htmlFor="exc-start">From</GlassLabel>
                <TimeSelect id="exc-start" value={startTime} onChange={setStartTime} />
              </div>
              <span className="pb-3 text-muted-foreground" aria-hidden="true">–</span>
              <div className="min-w-0">
                <GlassLabel htmlFor="exc-end">To</GlassLabel>
                <TimeSelect id="exc-end" value={endTime} onChange={setEndTime} />
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

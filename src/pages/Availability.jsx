import React, { useEffect, useState } from 'react';
import { api } from '@/lib/localApi';
import { Plus, Trash2, CalendarOff, X, Globe, RefreshCw } from 'lucide-react';
import { GlassButton, GlassInput, GlassSelect, GlassLabel, Spinner, PageHeader, Tabs } from '@/components/glass';
import { formatDate } from '@/lib/Availability.js';
import { Dialog, DialogContent, DialogTitle } from '@/components/ui/dialog';

const DAYS = ['Sunday','Monday','Tuesday','Wednesday','Thursday','Friday','Saturday'];

export default function Availability({ profile }) {
  const [rules, setRules] = useState([]);
  const [exceptions, setExceptions] = useState([]);
  const [loading, setLoading] = useState(true);
  const [showExc, setShowExc] = useState(false);

  useEffect(() => { load(); }, []);

  const load = async () => {
    try {
      let [r, e] = await Promise.all([
        api.entities.AvailabilityRule.filter({ created_by_id: profile.id }),
        api.entities.AvailabilityException.filter({ created_by_id: profile.id }, 'date'),
      ]);
      // Seed default Mon–Fri 9–17 for first-time users so booking pages work immediately.
      if (r.length === 0) {
        await api.entities.AvailabilityRule.bulkCreate(
          [1,2,3,4,5].map((dow) => ({ day_of_week: dow, start_time: '09:00', end_time: '17:00' }))
        );
        r = await api.entities.AvailabilityRule.filter({ created_by_id: profile.id });
      }
      setRules(r);
      setExceptions(e);
    } catch (err) {}
    setLoading(false);
  };

  const addRule = async (dayOfWeek) => {
    await api.entities.AvailabilityRule.create({ day_of_week: dayOfWeek, start_time: '09:00', end_time: '17:00' });
    load();
  };

  const updateRule = async (id, field, value) => {
    setRules((rs) => rs.map((r) => r.id === id ? { ...r, [field]: value } : r));
    await api.entities.AvailabilityRule.update(id, { [field]: value });
  };

  const deleteRule = async (id) => {
    await api.entities.AvailabilityRule.delete(id);
    setRules((rs) => rs.filter((r) => r.id !== id));
  };

  const addException = async (exc) => {
    await api.entities.AvailabilityException.create(exc);
    setShowExc(false);
    load();
  };

  const deleteException = async (id) => {
    await api.entities.AvailabilityException.delete(id);
    setExceptions((es) => es.filter((e) => e.id !== id));
  };

  if (loading) return <div className="flex justify-center py-24"><Spinner /></div>;

  const toggleDay = async (dow, on) => {
    const dayRules = rules.filter((r) => r.day_of_week === dow);
    if (on) return addRule(dow);
    await Promise.all(dayRules.map((r) => api.entities.AvailabilityRule.delete(r.id)));
    setRules((rs) => rs.filter((r) => r.day_of_week !== dow));
  };

  return (
    <div className="animate-fade-in">
      <PageHeader title="Availability">
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
            <p className="mt-1 mb-5 text-sm text-muted-foreground">Set when you are typically available for meetings</p>
            <div className="space-y-4">
              {DAYS.map((day, dow) => {
                const dayRules = rules.filter((r) => r.day_of_week === dow).sort((a,b)=> a.start_time.localeCompare(b.start_time));
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
                          <GlassInput type="time" value={r.start_time} onChange={(e)=>updateRule(r.id,'start_time',e.target.value)} className="h-10 flex-1 sm:flex-none sm:w-[118px] min-w-0 px-2.5 tabular" aria-label={`${day} start`} />
                          <span className="text-muted-foreground">–</span>
                          <GlassInput type="time" value={r.end_time} onChange={(e)=>updateRule(r.id,'end_time',e.target.value)} className="h-10 flex-1 sm:flex-none sm:w-[118px] min-w-0 px-2.5 tabular" aria-label={`${day} end`} />
                          <button onClick={()=>deleteRule(r.id)} aria-label="Remove interval" className="w-8 h-8 rounded-full flex items-center justify-center text-muted-foreground transition-all duration-200 hover:bg-secondary hover:text-foreground"><X className="w-4 h-4" /></button>
                        </div>
                      ))}
                    </div>
                    <button onClick={()=>addRule(dow)} aria-label={`Add hours on ${day}`} className="ml-auto sm:ml-0 mt-1 w-8 h-8 shrink-0 rounded-full flex items-center justify-center text-muted-foreground transition-all duration-200 hover:bg-secondary hover:text-foreground"><Plus className="w-4 h-4" /></button>
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
              <GlassButton size="sm" type="button" onClick={()=>setShowExc(true)}><Plus className="w-4 h-4" /> Hours</GlassButton>
            </div>
            <div className="mt-5">
              {exceptions.length === 0 ? (
                <p className="rounded-lg bg-secondary px-4 py-6 text-center text-sm text-muted-foreground">No date-specific hours yet. Add holidays, days off or one-off hours.</p>
              ) : (
                <ul className="divide-y divide-border rounded-lg border border-border">
                  {exceptions.map((e) => (
                    <li key={e.id} className="flex items-center justify-between gap-3 px-4 py-3">
                      <div className="min-w-0">
                        <div className="text-sm font-bold">{new Date(e.date+'T00:00').toLocaleDateString('en-US',{weekday:'short',month:'short',day:'numeric', year:'numeric'})}</div>
                        <div className="text-sm text-muted-foreground truncate">
                          {e.type === 'blocked' && !e.start_time ? 'Unavailable' : e.start_time ? `${e.start_time} – ${e.end_time}` : 'Available all day'}
                          {e.label ? ` · ${e.label}` : ''}
                        </div>
                      </div>
                      <button onClick={()=>deleteException(e.id)} aria-label="Remove date" className="w-8 h-8 rounded-full flex items-center justify-center text-muted-foreground transition-all duration-200 hover:bg-secondary hover:text-destructive"><Trash2 className="w-4 h-4" /></button>
                    </li>
                  ))}
                </ul>
              )}
            </div>
          </section>
        </div>
      </div>

      {showExc && <ExceptionModal onAdd={addException} onClose={()=>setShowExc(false)} />}
    </div>
  );
}

function ExceptionModal({ onAdd, onClose }) {
  const [date, setDate] = useState(formatDate(new Date()));
  const [type, setType] = useState('blocked');
  const [startTime, setStartTime] = useState('');
  const [endTime, setEndTime] = useState('');
  const [label, setLabel] = useState('');

  const save = () => {
    if (!date) return;
    onAdd({ date, type, start_time: startTime || null, end_time: endTime || null, label: label || null });
  };

  return (
    <Dialog open onOpenChange={(next) => { if (!next) onClose(); }}>
      <DialogContent showCloseButton={false} aria-describedby={undefined} className="max-w-md p-6 block">
        <div className="flex items-center justify-between mb-5">
          <DialogTitle>Add date-specific hours</DialogTitle>
          <button onClick={onClose} aria-label="Close" className="w-8 h-8 rounded-full flex items-center justify-center text-muted-foreground hover:bg-secondary"><X className="w-4 h-4" /></button>
        </div>
        <div className="space-y-4">
          <div>
            <GlassLabel>Date</GlassLabel>
            <GlassInput type="date" value={date} onChange={(e)=>setDate(e.target.value)} />
          </div>
          <div>
            <GlassLabel>Type</GlassLabel>
            <GlassSelect value={type} onChange={(e)=>setType(e.target.value)}>
              <option value="blocked">Blocked (unavailable)</option>
              <option value="available">Available (override)</option>
            </GlassSelect>
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <GlassLabel>Start (optional)</GlassLabel>
              <GlassInput type="time" value={startTime} onChange={(e)=>setStartTime(e.target.value)} />
            </div>
            <div>
              <GlassLabel>End (optional)</GlassLabel>
              <GlassInput type="time" value={endTime} onChange={(e)=>setEndTime(e.target.value)} />
            </div>
          </div>
          <div>
            <GlassLabel>Label (optional)</GlassLabel>
            <GlassInput value={label} onChange={(e)=>setLabel(e.target.value)} placeholder="Vacation, Holiday..." />
          </div>
        </div>
        <div className="flex justify-end gap-2 mt-6">
          <GlassButton type="button" variant="ghost" onClick={onClose}>Cancel</GlassButton>
          <GlassButton type="button" variant="primary" onClick={save}>Apply</GlassButton>
        </div>
      </DialogContent>
    </Dialog>
  );
}
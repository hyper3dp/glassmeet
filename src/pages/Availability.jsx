import React, { useEffect, useState } from 'react';
import { api } from '@/lib/localApi';
import { Clock, Plus, Trash2, CalendarOff, X } from 'lucide-react';
import { GlassCard, GlassButton, GlassInput, GlassSelect, GlassLabel, EmptyState, Spinner } from '@/components/glass';
import { formatDate } from '@/lib/Availability.js';

const DAYS = ['Sunday','Monday','Tuesday','Wednesday','Thursday','Friday','Saturday'];
const SHORT = ['Sun','Mon','Tue','Wed','Thu','Fri','Sat'];

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

  return (
    <div className="space-y-6 animate-fade-in">
      <div>
        <h1 className="text-2xl sm:text-3xl font-semibold tracking-tight">Availability</h1>
        <p className="text-muted-foreground text-sm mt-1">Set your working hours, breaks, and blocked dates.</p>
      </div>

      {/* Weekly */}
      <GlassCard hover={false}>
        <div className="flex items-center justify-between mb-4">
          <h2 className="font-semibold flex items-center gap-2"><Clock className="w-4 h-4 accent-text" /> Weekly hours</h2>
        </div>
        <div className="space-y-3">
          {DAYS.map((day, dow) => {
            const dayRules = rules.filter((r) => r.day_of_week === dow).sort((a,b)=> a.start_time.localeCompare(b.start_time));
            return (
              <div key={dow} className="flex flex-col sm:flex-row sm:items-start gap-3 py-3 border-b border-border/50 last:border-0">
                <div className="w-24 pt-2 font-medium text-sm">{SHORT[dow]}</div>
                <div className="flex-1 space-y-2">
                  {dayRules.length === 0 && <div className="text-sm text-muted-foreground py-2">Unavailable</div>}
                  {dayRules.map((r) => (
                    <div key={r.id} className="flex items-center gap-2">
                      <GlassInput type="time" value={r.start_time} onChange={(e)=>updateRule(r.id,'start_time',e.target.value)} className="!py-2 w-32" />
                      <span className="text-muted-foreground">to</span>
                      <GlassInput type="time" value={r.end_time} onChange={(e)=>updateRule(r.id,'end_time',e.target.value)} className="!py-2 w-32" />
                      <button onClick={()=>deleteRule(r.id)} className="w-8 h-8 rounded-lg glass flex items-center justify-center text-red-500"><Trash2 className="w-3.5 h-3.5" /></button>
                    </div>
                  ))}
                </div>
                <GlassButton size="sm" variant="ghost" onClick={()=>addRule(dow)}><Plus className="w-3.5 h-3.5" /> Add</GlassButton>
              </div>
            );
          })}
        </div>
      </GlassCard>

      {/* Exceptions */}
      <GlassCard hover={false}>
        <div className="flex items-center justify-between mb-4">
          <h2 className="font-semibold flex items-center gap-2"><CalendarOff className="w-4 h-4 accent-text" /> Blocked dates & overrides</h2>
          <GlassButton size="sm" variant="primary" onClick={()=>setShowExc(true)}><Plus className="w-3.5 h-3.5" /> Add date</GlassButton>
        </div>
        {exceptions.length === 0 ? (
          <EmptyState icon={CalendarOff} title="No blocked dates" description="Add vacation days, holidays, or one-off overrides here." />
        ) : (
          <div className="space-y-2">
            {exceptions.map((e) => (
              <div key={e.id} className="flex items-center justify-between glass rounded-xl p-3">
                <div>
                  <div className="font-medium text-sm">{new Date(e.date+'T00:00').toLocaleDateString('en-US',{weekday:'long',month:'long',day:'numeric'})}</div>
                  <div className="text-xs text-muted-foreground capitalize">{e.type}{e.start_time ? ` · ${e.start_time}–${e.end_time}` : ' · all day'}{e.label ? ` · ${e.label}` : ''}</div>
                </div>
                <button onClick={()=>deleteException(e.id)} className="w-8 h-8 rounded-lg glass flex items-center justify-center text-red-500"><Trash2 className="w-3.5 h-3.5" /></button>
              </div>
            ))}
          </div>
        )}
      </GlassCard>

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
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/30 backdrop-blur-sm animate-fade-in" onClick={onClose}>
      <div className="glass-panel w-full max-w-md p-6 animate-scale-in" onClick={(e)=>e.stopPropagation()}>
        <div className="flex items-center justify-between mb-5">
          <h2 className="text-lg font-semibold">Add date override</h2>
          <button onClick={onClose} className="w-8 h-8 rounded-lg glass flex items-center justify-center"><X className="w-4 h-4" /></button>
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
        <div className="flex gap-2 mt-6">
          <GlassButton className="flex-1" onClick={onClose}>Cancel</GlassButton>
          <GlassButton variant="primary" className="flex-1" onClick={save}>Add</GlassButton>
        </div>
      </div>
    </div>
  );
}
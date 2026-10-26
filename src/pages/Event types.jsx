import React, { useEffect, useState } from 'react';
import { useSearchParams, Link } from 'react-router-dom';
import { api } from '@/lib/localApi';
import { Plus, Clock, ExternalLink, Search, X, FileText, Trash2 } from 'lucide-react';
import { toast } from 'sonner';
import { GlassCard, GlassButton, GlassInput, GlassTextarea, GlassLabel, GlassSelect, Stepper, EmptyState, Spinner, PageHeader, Tabs, Avatar } from '@/components/glass';
import EventCard, { scheduleSummary } from '@/components/eventcard.jsx';
import { Dialog, DialogContent, DialogTitle } from '@/components/ui/dialog';
import { Switch } from '@/components/ui/switch';
import DatePicker, { MultiDatePicker } from '@/components/DatePicker.jsx';
import { formatDate, eventRunsOn } from '@/lib/Availability.js';
import { cn } from '@/lib/utils';
import { BUILT_IN_TEMPLATES, templateData, templateSummary } from '@/lib/templates';

export default function EventTypes({ profile }) {
  const [eventTypes, setEventTypes] = useState([]);
  const [loading, setLoading] = useState(true);
  const [showModal, setShowModal] = useState(false);
  const [editing, setEditing] = useState(null);
  const [query, setQuery] = useState('');
  const [templates, setTemplates] = useState([]);
  const [picking, setPicking] = useState(false);
  const [template, setTemplate] = useState(null);
  const [searchParams, setSearchParams] = useSearchParams();

  useEffect(() => { load(); }, []);

  // The top Create button links to ?new=true; react every time it appears, not only on first load
  useEffect(() => {
    if (searchParams.get('new') === 'true') {
      openNew();
      setSearchParams({}, { replace: true });
    }
  }, [searchParams]);

  const load = async () => {
    try {
      const [e, t] = await Promise.all([
        api.entities.EventType.filter({ created_by_id: profile.id }, '-created_date'),
        // the templates table may not exist yet; built-in templates still show
        api.entities.EventTemplate.filter({ created_by_id: profile.id }, '-created_date').catch(() => []),
      ]);
      setEventTypes(e);
      setTemplates(t);
    } catch (err) {}
    setLoading(false);
  };

  const [modalCount, setModalCount] = useState(0); // a fresh form each time "Create" opens
  // "Create" first asks what to start from: blank, one of the host's templates or a built-in one
  const openNew = () => setPicking(true);
  const startFrom = (t) => { setPicking(false); setEditing(null); setTemplate(t); setModalCount((n) => n + 1); setShowModal(true); };
  const openEdit = (e) => { setEditing(e); setTemplate(null); setShowModal(true); };

  const saveTemplate = async (data) => {
    const name = (data.name || '').trim() || 'Untitled template';
    const saved = await api.entities.EventTemplate.create({ name, data: { ...data, name } });
    setTemplates((list) => [saved, ...list]);
    toast.success(`Saved “${name}” as a template`);
  };
  const deleteTemplate = async (t) => {
    if (!confirm(`Delete the template “${t.name}”? Event types made from it stay as they are.`)) return;
    try {
      await api.entities.EventTemplate.delete(t.id);
      setTemplates((list) => list.filter((x) => x.id !== t.id));
    } catch (e) {
      alert(`Could not delete this template. ${e.message || ''}`.trim());
    }
  };

  const handleDelete = async (id) => {
    if (!confirm('Delete this event type? Existing bookings remain.')) return;
    try {
      await api.entities.EventType.delete(id);
      setEventTypes((list) => list.filter((e) => e.id !== id));
    } catch (e) {
      alert(`Could not delete this event type. ${e.message || ''}`.trim());
    }
  };

  const handleToggle = async (ev, active) => {
    try {
      const saved = await api.entities.EventType.update(ev.id, { active });
      if (!saved) throw new Error('It may have been deleted. Reload the page.');
      setEventTypes((list) => list.map((x) => (x.id === ev.id ? { ...x, active: saved.active } : x)));
    } catch (e) {
      alert(`Could not ${active ? 'turn on' : 'turn off'} this event type. ${e.message || ''}`.trim());
    }
  };

  const q = query.trim().toLowerCase();
  const shown = q ? eventTypes.filter((e) => (e.name || '').toLowerCase().includes(q)) : eventTypes;

  return (
    <div className="animate-fade-in">
      <PageHeader title="Scheduling" actions={<GlassButton variant="primary" type="button" onClick={openNew}><Plus className="w-4 h-4" strokeWidth={2.5} /> Create</GlassButton>}>
        <Tabs tabs={[{ value: 'types', label: 'Event types' }]} value="types" onChange={() => {}} />
      </PageHeader>

      <div className="mb-6 flex flex-col-reverse gap-4 sm:flex-row sm:items-center sm:justify-between">
        <div className="relative w-full sm:w-72">
          <Search className="pointer-events-none absolute left-3.5 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
          <GlassInput value={query} onChange={(e) => setQuery(e.target.value)} placeholder="Search event types" className="pl-10 rounded-full" aria-label="Search event types" />
        </div>
      </div>

      <div className="mb-4 flex items-center justify-between gap-4 border-b border-border pb-4">
        <div className="flex items-center gap-3 min-w-0">
          <Avatar src={profile?.profile_photo} name={profile?.full_name} size={36} />
          <div className="text-[15px] font-bold truncate">{profile?.full_name || 'You'}</div>
        </div>
        {eventTypes[0] && (
          <Link to={`/book/${eventTypes[0].id}`} className="shrink-0 text-sm font-semibold text-link flex items-center gap-1.5 hover:underline">
            <ExternalLink className="w-4 h-4" /> View landing page
          </Link>
        )}
      </div>

      {loading ? <div className="flex justify-center py-20"><Spinner /></div> : eventTypes.length === 0 ? (
        <GlassCard hover={false}>
          <EmptyState icon={Clock} title="Create your first event type" description="An event type is a meeting guests can book, like a 30 minute call. Share its link and guests pick a time." action={<GlassButton variant="primary" type="button" onClick={openNew}><Plus className="w-4 h-4" /> New event type</GlassButton>} />
        </GlassCard>
      ) : shown.length === 0 ? (
        <p className="py-12 text-center text-sm text-muted-foreground">No event types match &ldquo;{query}&rdquo;.</p>
      ) : (
        <div className="grid sm:grid-cols-2 xl:grid-cols-3 gap-5">
          {shown.map((e) => (
            <EventCard
              key={e.id} event={e} onEdit={() => openEdit(e)} onDelete={() => handleDelete(e.id)} onToggle={(active) => handleToggle(e, active)}
              onSaveTemplate={() => saveTemplate(templateData(e)).catch((err) => alert(`Could not save the template. ${err.message || ''}`.trim()))}
            />
          ))}
        </div>
      )}

      {picking && <TemplatePicker templates={templates} onPick={startFrom} onDelete={deleteTemplate} onClose={() => setPicking(false)} />}

      {showModal && (
        <EventModal
          key={editing?.id || `new-${modalCount}`}
          event={editing}
          template={template}
          hostId={profile.id}
          onClose={() => setShowModal(false)}
          onSaveTemplate={saveTemplate}
          onSave={async (values) => {
            const payload = {
              ...values,
              host_name: profile.full_name || profile.email,
              host_timezone: profile.timezone || Intl.DateTimeFormat().resolvedOptions().timeZone,
            };
            if (editing) {
              const saved = await api.entities.EventType.update(editing.id, payload);
              setEventTypes((list) => list.map((x) => (x.id === editing.id ? (saved || { ...x, ...payload }) : x)));
            } else {
              const saved = await api.entities.EventType.create(payload);
              setEventTypes((list) => [saved, ...list]);
            }
            setShowModal(false);
          }}
        />
      )}
    </div>
  );
}

function TemplateTile({ icon: Icon = FileText, name, summary, onPick, onDelete }) {
  return (
    <li className="relative">
      <button type="button" onClick={onPick}
        className="flex h-full w-full items-start gap-3 rounded-xl border border-border bg-card p-4 pr-10 text-left transition-all duration-200 hover:border-primary hover:bg-primary-soft">
        <span className="w-9 h-9 shrink-0 rounded-lg bg-primary-soft text-link flex items-center justify-center"><Icon className="w-[18px] h-[18px]" /></span>
        <span className="min-w-0">
          <span className="block text-sm font-bold text-foreground">{name}</span>
          {summary && <span className="mt-0.5 block text-xs text-muted-foreground">{summary}</span>}
        </span>
      </button>
      {onDelete && (
        <button type="button" onClick={onDelete} aria-label={`Delete template ${name}`}
          className="absolute right-2 top-2 w-8 h-8 rounded-full flex items-center justify-center text-muted-foreground transition-all duration-200 hover:bg-secondary hover:text-destructive">
          <Trash2 className="w-4 h-4" />
        </button>
      )}
    </li>
  );
}

function TemplatePicker({ templates, onPick, onDelete, onClose }) {
  return (
    <Dialog open onOpenChange={(next) => { if (!next) onClose(); }}>
      <DialogContent showCloseButton={false} aria-describedby={undefined} className="sm:max-w-2xl p-0 sm:pb-0 block">
        <div className="sticky top-0 z-10 flex items-center justify-between border-b border-border bg-popover px-6 py-4">
          <DialogTitle>New event type</DialogTitle>
          <button type="button" aria-label="Close" onClick={onClose} className="w-8 h-8 rounded-full flex items-center justify-center text-muted-foreground hover:bg-secondary"><X className="w-4 h-4" /></button>
        </div>
        <div className="space-y-6 px-6 py-5">
          <ul className="grid gap-3 sm:grid-cols-2">
            <TemplateTile icon={Plus} name="Start from scratch" summary="A blank event type" onPick={() => onPick(null)} />
          </ul>
          <section>
            <h3 className="mb-1 text-sm font-semibold">Your templates</h3>
            {templates.length ? (
              <ul className="mt-2 grid gap-3 sm:grid-cols-2">
                {templates.map((t) => (
                  <TemplateTile key={t.id} name={t.name} summary={templateSummary(t.data || {})} onPick={() => onPick(t)} onDelete={() => onDelete(t)} />
                ))}
              </ul>
            ) : (
              <p className="text-sm text-muted-foreground">Save any event type as a template from its form or its menu, and it appears here.</p>
            )}
          </section>
          <section>
            <h3 className="mb-2 text-sm font-semibold">Templates</h3>
            <ul className="grid gap-3 sm:grid-cols-2">
              {BUILT_IN_TEMPLATES.map((t) => (
                <TemplateTile key={t.id} name={t.name} summary={templateSummary(t.data)} onPick={() => onPick(t)} />
              ))}
            </ul>
          </section>
        </div>
      </DialogContent>
    </Dialog>
  );
}

const DESCRIPTION_MAX = 500;
const WEEKDAYS = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
const ALL_DAYS = [0, 1, 2, 3, 4, 5, 6];
const DURATIONS = [15, 30, 45, 60, 90];
// value stored in event_types.location; kind decides which extra field shows
export const LOCATIONS = [
  { value: 'Google Meet', kind: 'video' },
  { value: 'Zoom', kind: 'video' },
  { value: 'Microsoft Teams', kind: 'video' },
  { value: 'WhatsApp call', kind: 'phone' },
  { value: 'Phone call', kind: 'phone' },
  { value: 'In person', kind: 'in_person' },
  { value: 'Other', kind: 'other' },
];

function ToggleRow({ id, label, description, checked, onChange }) {
  return (
    <label htmlFor={id} className="flex items-start justify-between gap-4 py-3 cursor-pointer">
      <span className="min-w-0">
        <span className="block text-sm font-semibold text-foreground">{label}</span>
        <span className="block text-sm text-muted-foreground">{description}</span>
      </span>
      <Switch id={id} checked={checked} onCheckedChange={onChange} className="mt-0.5" />
    </label>
  );
}

const pillClass = (on) => `h-9 px-4 rounded-full border text-sm font-semibold transition-all duration-200 ${on ? 'border-primary bg-primary-soft text-link' : 'border-input text-foreground hover:border-border-hover'}`;
const shortDate = (key) => { const [y, m, d] = key.split('-').map(Number); return new Date(y, m - 1, d).toLocaleDateString(undefined, { weekday: 'short', day: 'numeric', month: 'short' }); };

// event: the event type being edited; template: { data } to start a new one from
function EventModal({ event, template, hostId, onClose, onSave, onSaveTemplate }) {
  const [saving, setSaving] = useState(false);
  const [savingTemplate, setSavingTemplate] = useState(false);
  const [error, setError] = useState('');
  const today = formatDate(new Date());
  const src = event || template?.data || {};
  const known = LOCATIONS.find((l) => l.value === src.location);
  const [form, setForm] = useState(() => ({
    name: src.name || '',
    description: (src.description || '').slice(0, DESCRIPTION_MAX),
    duration: src.duration || 30,
    location: known ? known.value : src.location ? 'Other' : 'Google Meet',
    custom_location: known ? '' : src.location || '',
    meeting_url: src.meeting_url || '',
    address: src.address || '',
    booking_type: src.booking_type || 'one_on_one',
    max_attendees: src.max_attendees || 2,
    active: event?.active ?? true,
    requires_approval: src.requires_approval ?? false,
    email_required: src.email_required ?? true,
    schedule: src.schedule === 'dates' ? 'dates' : 'weekly',
    freq: ['day', 'week', 'month'].includes(src.freq) ? src.freq : 'week',
    every: src.every || 1,
    days: src.days?.length ? [...src.days].sort() : ALL_DAYS,
    start_date: event?.start_date || today,
    ends: event?.end_date ? 'date' : 'never',
    end_date: event?.end_date || '',
    dates: event?.dates ? [...event.dates].sort() : [],
  }));
  const [customDuration, setCustomDuration] = useState(() => !DURATIONS.includes(Number(src.duration) || 30));
  const setField = (field, value) => setForm((current) => ({ ...current, [field]: value }));
  const kind = LOCATIONS.find((l) => l.value === form.location)?.kind;
  const every = Math.max(1, Number(form.every) || 1);
  const toggleDay = (dow) => setField('days', form.days.includes(dow) ? form.days.filter((d) => d !== dow) : [...form.days, dow].sort());

  // The host's hours, to flag days the event would run on but nobody can book
  const [hours, setHours] = useState(null);
  useEffect(() => {
    Promise.all([
      api.entities.AvailabilityRule.filter({ created_by_id: hostId }),
      api.entities.AvailabilityException.filter({ created_by_id: hostId }),
    ]).then(([rules, exceptions]) => setHours({
      days: new Set(rules.map((r) => r.day_of_week)),
      dates: new Set(exceptions.filter((e) => e.type === 'available').map((e) => e.date)),
    })).catch(() => {});
  }, []);
  const dateHasHours = (key) => !hours || hours.dates.has(key) || hours.days.has(new Date(`${key}T00:00`).getDay());
  const closedDays = hours && form.freq === 'week' ? form.days.filter((d) => !hours.days.has(d)) : [];

  // No day in the coming year both runs and has hours: guests would find nothing to book
  const nothingToBook = (() => {
    if (!hours || (form.schedule === 'dates' && !form.dates.length)) return false;
    const preview = { ...form, every, end_date: form.ends === 'date' ? form.end_date : null };
    const now = new Date();
    for (let i = 0; i < 366; i++) {
      const day = new Date(now.getFullYear(), now.getMonth(), now.getDate() + i);
      if (eventRunsOn(preview, day) && dateHasHours(formatDate(day))) return false;
    }
    return true;
  })();

  // Saved addresses (Settings → Addresses). 'new' means typing one here.
  const [addresses, setAddresses] = useState([]);
  const [savedAddressesAvailable, setSavedAddressesAvailable] = useState(false);
  const [addressChoice, setAddressChoice] = useState('new');
  const [newAddressLabel, setNewAddressLabel] = useState('');
  const [saveNewAddress, setSaveNewAddress] = useState(true);
  useEffect(() => {
    api.entities.Address.filter({}, 'created_date').then((list) => {
      setAddresses(list);
      setSavedAddressesAvailable(true);
      const match = list.find((a) => a.address === form.address);
      if (match) setAddressChoice(match.id);
      else if (!form.address && list[0]) { setAddressChoice(list[0].id); setField('address', list[0].address); }
    }).catch(() => setSavedAddressesAvailable(false));
  }, []);
  const pickAddress = (choice) => {
    setAddressChoice(choice);
    const a = addresses.find((x) => x.id === choice);
    setField('address', a ? a.address : '');
  };

  const submit = async (submitEvent) => {
    submitEvent.preventDefault();
    setError('');
    if (kind === 'in_person' && !form.address.trim()) { setError('Add the address where you will meet.'); return; }
    if (kind === 'other' && !form.custom_location.trim()) { setError('Describe where the meeting happens.'); return; }
    const repeats = form.schedule === 'weekly';
    if (repeats && form.freq === 'week' && !form.days.length) { setError('Pick at least one day the event repeats on.'); return; }
    if (repeats && !form.start_date) { setError('Pick the date the event starts.'); return; }
    if (repeats && form.ends === 'date' && !form.end_date) { setError('Pick the last date, or choose Never.'); return; }
    if (repeats && form.ends === 'date' && form.end_date < form.start_date) { setError('The last date is before the start date.'); return; }
    if (!repeats && !form.dates.length) { setError('Pick at least one date.'); return; }
    setSaving(true);
    try {
      if (kind === 'in_person' && addressChoice === 'new' && saveNewAddress && savedAddressesAvailable) {
        const saved = await api.entities.Address.create({ label: newAddressLabel.trim(), address: form.address.trim() });
        setAddresses((list) => [...list, saved]);
        setAddressChoice(saved.id);
      }
      await onSave(values());
    } catch (e) {
      setError(e.message || 'Could not save this event type.');
    } finally {
      setSaving(false);
    }
  };

  // the event type's fields as saved
  const values = () => {
    const { custom_location, ends, ...rest } = form;
    const repeats = form.schedule === 'weekly';
    return {
      ...rest,
      freq: form.freq,
      every,
      days: repeats && form.freq === 'week' && form.days.length < 7 ? form.days : null,
      start_date: repeats ? form.start_date : null,
      end_date: repeats && ends === 'date' ? form.end_date : null,
      dates: repeats ? null : form.dates,
      location: kind === 'other' ? custom_location.trim() : form.location,
      meeting_url: kind === 'video' || kind === 'other' ? form.meeting_url.trim() : '',
      address: kind === 'in_person' ? form.address.trim() : null,
      duration: Math.min(720, Math.max(5, Number(form.duration) || 30)),
      max_attendees: form.booking_type === 'group' ? Math.min(500, Math.max(2, Number(form.max_attendees) || 2)) : 1,
    };
  };

  const saveAsTemplate = async () => {
    setError('');
    if (!form.name.trim()) { setError('Give the event a name first; the template uses it.'); return; }
    setSavingTemplate(true);
    try {
      await onSaveTemplate(templateData(values()));
    } catch (e) {
      setError(`Could not save the template. ${e.message || ''}`.trim());
    } finally {
      setSavingTemplate(false);
    }
  };

  return (
    <Dialog open onOpenChange={(next) => { if (!next) onClose(); }}>
      <DialogContent showCloseButton={false} aria-describedby={undefined} className="sm:max-w-xl p-0 sm:pb-0 block">
        <div className="sticky top-0 z-10 flex items-center justify-between border-b border-border bg-popover px-6 py-4">
          <DialogTitle>{event ? 'Edit event type' : 'New event type'}</DialogTitle>
          <button type="button" aria-label="Close" onClick={onClose} className="w-8 h-8 rounded-full flex items-center justify-center text-muted-foreground hover:bg-secondary"><X className="w-4 h-4" /></button>
        </div>
        <form onSubmit={submit} className="space-y-5 px-6 pt-5">
          <div>
            <GlassLabel htmlFor="event-name">Name</GlassLabel>
            <GlassInput id="event-name" value={form.name} maxLength={80} onChange={(e) => setField('name', e.target.value)} placeholder="30 minute meeting" required autoFocus />
          </div>
          <div>
            <div className="flex items-center justify-between">
              <GlassLabel htmlFor="event-description">Description</GlassLabel>
              <span className={`mb-2 text-xs tabular ${form.description.length >= DESCRIPTION_MAX ? 'text-destructive' : 'text-muted-foreground'}`}>{form.description.length}/{DESCRIPTION_MAX}</span>
            </div>
            <GlassTextarea id="event-description" rows={3} maxLength={DESCRIPTION_MAX} value={form.description} onChange={(e) => setField('description', e.target.value.slice(0, DESCRIPTION_MAX))} placeholder="What guests should know before booking" />
          </div>

          <fieldset>
            <legend className="mb-2 text-sm font-semibold text-foreground">Duration</legend>
            <div className="flex flex-wrap gap-2">
              {DURATIONS.map((d) => {
                const on = !customDuration && Number(form.duration) === d;
                return (
                  <button key={d} type="button" aria-pressed={on} onClick={() => { setCustomDuration(false); setField('duration', d); }}
                    className={pillClass(on)}>
                    {d < 60 ? `${d} min` : d === 60 ? '1 hr' : '1.5 hr'}
                  </button>
                );
              })}
              <button type="button" aria-pressed={customDuration} onClick={() => setCustomDuration(true)}
                className={pillClass(customDuration)}>
                Custom
              </button>
            </div>
            {customDuration && (
              <div className="mt-3">
                <Stepper value={form.duration} onChange={(v) => setField('duration', v)} min={5} max={720} step={5} suffix="min" aria-label="Custom duration in minutes" className="w-40" />
              </div>
            )}
          </fieldset>

          <fieldset>
            <legend className="mb-2 text-sm font-semibold text-foreground">Dates</legend>
            <div className="flex flex-wrap gap-2">
              <button type="button" aria-pressed={form.schedule === 'weekly'} onClick={() => setField('schedule', 'weekly')} className={pillClass(form.schedule === 'weekly')}>Repeats</button>
              <button type="button" aria-pressed={form.schedule === 'dates'} onClick={() => setField('schedule', 'dates')} className={pillClass(form.schedule === 'dates')}>Specific dates</button>
            </div>

            {form.schedule === 'weekly' ? (
              <div className="mt-4 space-y-4">
                <div className="flex flex-wrap items-center gap-2">
                  <span className="text-sm font-semibold">Every</span>
                  <Stepper value={form.every} onChange={(v) => setField('every', v)} min={1} max={52} aria-label="Repeat every" className="w-32" />
                  <GlassSelect value={form.freq} onChange={(e) => setField('freq', e.target.value)} aria-label="Repeat unit" className="w-32">
                    <option value="day">{every === 1 ? 'day' : 'days'}</option>
                    <option value="week">{every === 1 ? 'week' : 'weeks'}</option>
                    <option value="month">{every === 1 ? 'month' : 'months'}</option>
                  </GlassSelect>
                </div>
                {form.freq === 'week' && (
                  <div>
                    <p id="event-days-label" className="mb-2 text-sm font-semibold">On</p>
                    <div className="grid grid-cols-7 gap-1.5 sm:flex sm:flex-wrap" role="group" aria-labelledby="event-days-label">
                      {WEEKDAYS.map((label, dow) => (
                        <button key={label} type="button" aria-pressed={form.days.includes(dow)} onClick={() => toggleDay(dow)}
                          className={cn(pillClass(form.days.includes(dow)), 'px-0 sm:w-14')}>
                          {label}
                        </button>
                      ))}
                    </div>
                  </div>
                )}
                <div className="grid gap-3 sm:grid-cols-2">
                  <div>
                    <GlassLabel htmlFor="event-start">Starts</GlassLabel>
                    <DatePicker id="event-start" value={form.start_date} onChange={(v) => setField('start_date', v)} />
                  </div>
                  <div>
                    <GlassLabel htmlFor="event-ends">Ends</GlassLabel>
                    <GlassSelect id="event-ends" value={form.ends} onChange={(e) => setField('ends', e.target.value)}>
                      <option value="never">Never</option>
                      <option value="date">On a date</option>
                    </GlassSelect>
                  </div>
                  {form.ends === 'date' && (
                    <div className="sm:col-start-2">
                      <GlassLabel htmlFor="event-end">Last date</GlassLabel>
                      <DatePicker id="event-end" value={form.end_date} min={form.start_date || today} onChange={(v) => setField('end_date', v)} />
                    </div>
                  )}
                </div>
                <p className="rounded-lg bg-secondary px-3.5 py-2.5 text-sm text-foreground" aria-live="polite">
                  {scheduleSummary({ ...form, every, end_date: form.ends === 'date' ? form.end_date : null })}
                  {form.start_date > today && `, starting ${shortDate(form.start_date)}`}
                  {form.freq === 'month' && Number(form.start_date.slice(8)) > 28 && '. Shorter months use their last day.'}
                </p>
                {closedDays.length > 0 && (
                  <p className="text-sm text-warning">No weekly hours on {closedDays.map((d) => WEEKDAYS[d]).join(', ')}, so guests can’t book those days. Add hours in Availability.</p>
                )}
              </div>
            ) : (
              <div className="mt-4 grid gap-4 sm:grid-cols-[auto_1fr]">
                <MultiDatePicker value={form.dates} onChange={(v) => setField('dates', v)} min={today} labelledBy="event-dates-label" />
                <div className="min-w-0">
                  <p id="event-dates-label" className="mb-2 text-sm text-muted-foreground">{form.dates.length ? `${form.dates.length} ${form.dates.length === 1 ? 'date' : 'dates'} picked` : 'Pick the days guests can book.'}</p>
                  <ul className="flex flex-wrap gap-1.5 sm:max-h-64 sm:overflow-y-auto">
                    {form.dates.map((key) => (
                      <li key={key} className={`inline-flex h-8 items-center gap-1 rounded-full border pl-3 pr-1 text-sm font-semibold ${dateHasHours(key) ? 'border-border' : 'border-warning text-warning'}`}
                        title={dateHasHours(key) ? undefined : 'No hours on this day'}>
                        {shortDate(key)}
                        <button type="button" aria-label={`Remove ${shortDate(key)}`} onClick={() => setField('dates', form.dates.filter((k) => k !== key))}
                          className="w-6 h-6 rounded-full flex items-center justify-center text-muted-foreground transition-all duration-200 hover:bg-secondary hover:text-foreground">
                          <X className="w-3.5 h-3.5" />
                        </button>
                      </li>
                    ))}
                  </ul>
                  {form.dates.some((key) => !dateHasHours(key)) && (
                    <p className="mt-2 text-sm text-warning">Dates in orange have no hours. Add hours for them in Availability.</p>
                  )}
                </div>
              </div>
            )}
            {nothingToBook && (
              <p role="alert" className="mt-3 rounded-lg border border-warning px-3.5 py-2.5 text-sm text-warning">
                No upcoming day fits these settings and your hours, so guests can’t book this event. Check the days and dates, or your hours in Availability.
              </p>
            )}
            <p className="mt-3 text-xs text-muted-foreground">Times on each day come from your hours in Availability.</p>
          </fieldset>

          <div>
            <GlassLabel htmlFor="event-location">Location</GlassLabel>
            <GlassSelect id="event-location" value={form.location} onChange={(e) => setField('location', e.target.value)}>
              {LOCATIONS.map((l) => <option key={l.value} value={l.value}>{l.value}</option>)}
            </GlassSelect>
          </div>
          {kind === 'in_person' && (
            <div className="space-y-3">
              <div>
                <GlassLabel htmlFor="event-address-pick">Address</GlassLabel>
                <GlassSelect id="event-address-pick" value={addressChoice} onChange={(e) => pickAddress(e.target.value)}>
                  {addresses.map((a) => <option key={a.id} value={a.id}>{a.label ? `${a.label}: ` : ''}{a.address.replace(/\s*\n\s*/g, ', ')}</option>)}
                  <option value="new">{addresses.length ? 'New address…' : 'Enter an address…'}</option>
                </GlassSelect>
              </div>
              {addressChoice === 'new' && (
                <div className="space-y-3 rounded-lg border border-border p-3.5">
                  <GlassTextarea id="event-address" rows={2} maxLength={300} value={form.address} onChange={(e) => setField('address', e.target.value)} placeholder="Street, building, city" aria-label="New address" required />
                  {savedAddressesAvailable && (
                    <div className="grid gap-3 sm:grid-cols-[1fr_auto] sm:items-center">
                      <GlassInput maxLength={40} value={newAddressLabel} onChange={(e) => setNewAddressLabel(e.target.value)} placeholder="Label, e.g. Office (optional)" aria-label="Address label" />
                      <label className="flex items-center gap-2 text-sm font-semibold">
                        <Switch checked={saveNewAddress} onCheckedChange={setSaveNewAddress} aria-label="Save to my addresses" /> Save to my addresses
                      </label>
                    </div>
                  )}
                </div>
              )}
              <p className="text-xs text-muted-foreground">Shown to guests on the booking page and confirmation. Manage saved addresses in Settings.</p>
            </div>
          )}
          {kind === 'other' && (
            <div>
              <GlassLabel htmlFor="event-custom-location">Where</GlassLabel>
              <GlassInput id="event-custom-location" maxLength={80} value={form.custom_location} onChange={(e) => setField('custom_location', e.target.value)} placeholder="e.g. Webex, Signal" required />
            </div>
          )}
          {(kind === 'video' || kind === 'other') && (
            <div>
              <GlassLabel htmlFor="event-meeting-url">Meeting link (optional)</GlassLabel>
              <GlassInput id="event-meeting-url" type="url" inputMode="url" value={form.meeting_url} onChange={(e) => setField('meeting_url', e.target.value)} placeholder="https://" />
            </div>
          )}
          {kind === 'phone' && (
            <p className="rounded-lg bg-secondary px-3.5 py-3 text-sm text-muted-foreground">You call the guest on the WhatsApp number they give when booking.</p>
          )}

          <div className="divide-y divide-border rounded-lg border border-border px-4">
            <ToggleRow id="ev-group" label="Let several guests book the same time" description="Good for classes, workshops and group calls." checked={form.booking_type === 'group'} onChange={(v) => setField('booking_type', v ? 'group' : 'one_on_one')} />
            {form.booking_type === 'group' && (
              <div className="flex items-center justify-between gap-4 py-3">
                <label htmlFor="event-capacity" className="text-sm font-semibold">Spots per time</label>
                <Stepper id="event-capacity" value={form.max_attendees} onChange={(v) => setField('max_attendees', v)} min={2} max={500} className="w-32" />
              </div>
            )}
            <ToggleRow id="ev-active" label="Active" description="Guests can book this event from its link." checked={form.active} onChange={(v) => setField('active', v)} />
            <ToggleRow id="ev-approval" label="Requires approval" description="You approve each booking before it is confirmed." checked={form.requires_approval} onChange={(v) => setField('requires_approval', v)} />
            <ToggleRow id="ev-email" label="Ask for email" description="Guests must enter an email address. Off: email is optional." checked={form.email_required} onChange={(v) => setField('email_required', v)} />
          </div>

          {error && <p role="alert" className="text-sm text-destructive">{error}</p>}
          {/* phones: two equal columns so the buttons can never overlap; wider: right-aligned */}
          <div className="sticky bottom-0 -mx-6 grid grid-cols-2 gap-2 border-t border-border bg-popover px-6 pt-4 pb-[max(1rem,env(safe-area-inset-bottom))] sm:pb-4 sm:flex sm:justify-end">
            {onSaveTemplate && (
              <GlassButton type="button" variant="ghost" onClick={saveAsTemplate} disabled={savingTemplate} className="col-span-2 min-w-0 sm:mr-auto sm:px-3">
                <FileText className="w-4 h-4" /> {savingTemplate ? 'Saving…' : 'Save as template'}
              </GlassButton>
            )}
            <GlassButton type="button" variant="default" onClick={onClose} className="min-w-0 sm:border-transparent sm:bg-transparent">Cancel</GlassButton>
            <GlassButton type="submit" variant="primary" disabled={saving} className="min-w-0">{saving ? 'Saving…' : event ? 'Save changes' : 'Create event type'}</GlassButton>
          </div>
        </form>
      </DialogContent>
    </Dialog>
  );
}

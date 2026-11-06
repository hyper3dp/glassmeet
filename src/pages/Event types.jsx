import React, { useEffect, useRef, useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import { api } from '@/lib/localApi';
import { ArrowLeft, CalendarClock, Check, ChevronRight, Plus, Clock, ExternalLink, Search, User, Users, X, FileText, Trash2 } from 'lucide-react';
import { toast } from 'sonner';
import { GlassCard, GlassButton, GlassInput, GlassTextarea, GlassLabel, GlassSelect, Stepper, EmptyState, Spinner, LoadError, PageHeader, Tabs, Avatar, TimeSelect } from '@/components/glass';
import EventCard, { scheduleSummary } from '@/components/eventcard.jsx';
import { Dialog, DialogContent, DialogTitle } from '@/components/ui/dialog';
import { Switch } from '@/components/ui/switch';
import DatePicker, { MultiDatePicker } from '@/components/DatePicker.jsx';
import { formatDate, eventRunsOn, minutesToLabel } from '@/lib/Availability.js';
import { cn } from '@/lib/utils';
import { BUILT_IN_TEMPLATES, templateData, templateSummary } from '@/lib/templates';
import { appPath } from '@/lib/authReturnTo';
import { LIMITS, onlyTitle } from '@/lib/inputRules';

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

  const [loadFailed, setLoadFailed] = useState(false);
  const load = async () => {
    setLoadFailed(false);
    try {
      const [e, t] = await Promise.all([
        api.entities.EventType.filter({ created_by_id: profile.id }, '-created_date'),
        // the templates table may not exist yet; built-in templates still show
        api.entities.EventTemplate.filter({ created_by_id: profile.id }, '-created_date').catch(() => []),
      ]);
      setEventTypes(e);
      setTemplates(t);
    } catch {
      setLoadFailed(true);
    }
    setLoading(false);
  };

  const [modalCount, setModalCount] = useState(0); // a fresh form each time "Create" opens
  // "Create" opens the form, which starts by asking what kind of event it is; its "Use a template"
  // button offers the host's templates and the built-in ones
  const openNew = () => startFrom(null);
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

  const [deleting, setDeleting] = useState(null); // the event type waiting on "Delete?"
  const handleDelete = async (id) => {
    setDeleting(null);
    try {
      await api.entities.EventType.delete(id);
      setEventTypes((list) => list.filter((e) => e.id !== id));
    } catch (e) {
      alert(`Could not delete this event type. ${e.message || ''}`.trim());
    }
  };
  // opens the create form filled in from an existing event, its dates included (a template
  // leaves them out, but a copy of a "specific dates" event needs them)
  const duplicate = (e) => startFrom({ data: { ...templateData(e), name: `${e.name} (copy)`, start_date: e.start_date, end_date: e.end_date, dates: e.dates?.filter((d) => d >= formatDate(new Date())) } });

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
  // a turned-off event's page says it's unavailable, so preview the first one that's on
  const previewEvent = eventTypes.find((e) => e.active ?? true);
  const shown = q ? eventTypes.filter((e) => (e.name || '').toLowerCase().includes(q)) : eventTypes;

  return (
    <div className="animate-fade-in">
      <PageHeader title="Scheduling" actions={<GlassButton variant="primary" type="button" onClick={openNew}><Plus className="w-4 h-4" strokeWidth={2.5} /> Create</GlassButton>}>
        <Tabs tabs={[{ value: 'types', label: 'Event types' }]} value="types" onChange={() => {}} />
      </PageHeader>

      <div className="mb-6 flex flex-col-reverse gap-4 sm:flex-row sm:items-center sm:justify-between">
        <div className="relative w-full sm:w-72">
          <Search className="pointer-events-none absolute left-3.5 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
          <GlassInput maxLength={LIMITS.search} value={query} onChange={(e) => setQuery(e.target.value)} placeholder="Search event types" className="pl-10 rounded-full" aria-label="Search event types" />
        </div>
      </div>

      <div className="mb-4 flex items-center justify-between gap-4 border-b border-border pb-4">
        <div className="flex items-center gap-3 min-w-0">
          <Avatar src={profile?.profile_photo} name={profile?.full_name} size={36} />
          <div className="text-[15px] font-bold truncate">{profile?.full_name || 'You'}</div>
        </div>
        {previewEvent && (
          <a href={appPath(`/book/${previewEvent.id}`)} target="_blank" rel="noreferrer" className="shrink-0 text-sm font-semibold text-link flex items-center gap-1.5 hover:underline">
            <ExternalLink className="w-4 h-4" /> Preview booking page
          </a>
        )}
      </div>

      {loading ? <div className="flex justify-center py-20"><Spinner /></div> : loadFailed ? (
        <LoadError what="Your event types" onRetry={() => { setLoading(true); load(); }} />
      ) : eventTypes.length === 0 ? (
        <GlassCard hover={false}>
          <EmptyState icon={Clock} title="Create your first event type" description="An event type is a meeting guests can book, like a 30 minute call. Share its link and guests pick a time." action={<GlassButton variant="primary" type="button" onClick={openNew}><Plus className="w-4 h-4" /> New event type</GlassButton>} />
        </GlassCard>
      ) : shown.length === 0 ? (
        <p className="py-12 text-center text-sm text-muted-foreground">No event types match &ldquo;{query}&rdquo;.</p>
      ) : (
        <div className="grid sm:grid-cols-2 xl:grid-cols-3 gap-5">
          {shown.map((e) => (
            <EventCard
              key={e.id} event={e} onEdit={() => openEdit(e)} onDuplicate={() => duplicate(e)} onDelete={() => setDeleting(e)} onToggle={(active) => handleToggle(e, active)}
              onSaveTemplate={() => saveTemplate(templateData(e)).catch((err) => alert(`Could not save the template. ${err.message || ''}`.trim()))}
            />
          ))}
        </div>
      )}

      {deleting && (
        <Dialog open onOpenChange={(next) => { if (!next) setDeleting(null); }}>
          <DialogContent showCloseButton={false} className="sm:max-w-sm p-6 block">
            <DialogTitle>Delete “{deleting.name}”?</DialogTitle>
            <p className="mt-2 text-sm text-muted-foreground">Its booking link stops working. Meetings already booked stay on your calendar.</p>
            <div className="mt-6 flex flex-wrap justify-end gap-2">
              <GlassButton type="button" variant="ghost" onClick={() => setDeleting(null)}>Keep it</GlassButton>
              {(deleting.active ?? true) && (
                <GlassButton type="button" onClick={() => { handleToggle(deleting, false); setDeleting(null); }}>Turn off instead</GlassButton>
              )}
              <GlassButton type="button" variant="danger" onClick={() => handleDelete(deleting.id)}>Delete</GlassButton>
            </div>
          </DialogContent>
        </Dialog>
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
          onPickTemplate={() => setPicking(true)}
          onSave={async (values) => {
            const payload = {
              ...values,
              host_name: profile.full_name || null,
              host_photo: profile.profile_photo || null,
              host_timezone: profile.timezone || Intl.DateTimeFormat().resolvedOptions().timeZone,
            };
            let saved;
            if (editing) {
              saved = await api.entities.EventType.update(editing.id, payload);
              if (!saved) throw new Error('This event type may have been deleted. Reload the page.');
              setEventTypes((list) => list.map((x) => (x.id === editing.id ? saved : x)));
            } else {
              saved = await api.entities.EventType.create(payload);
              setEventTypes((list) => [saved, ...list]);
            }
            setShowModal(false);
            const id = saved?.id || editing?.id;
            const link = id ? `${window.location.origin}${appPath(`/book/${id}`)}` : '';
            toast.success(editing ? 'Event saved' : 'Event created', link ? {
              action: { label: 'Copy link', onClick: () => navigator.clipboard.writeText(link).then(() => toast.success('Link copied'), () => toast.error('Could not copy the link')) },
            } : undefined);
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
          {/* the host's own templates, once they've saved some */}
          {templates.length > 0 && (
            <section>
              <h3 className="mb-2 text-sm font-semibold">Your templates</h3>
              <ul className="grid gap-3 sm:grid-cols-2">
                {templates.map((t) => (
                  <TemplateTile key={t.id} name={t.name} summary={templateSummary(t.data || {})} onPick={() => onPick(t)} onDelete={() => onDelete(t)} />
                ))}
              </ul>
            </section>
          )}
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

// The form's panels: 'main' is the create screen; the others open from a row and go back to it
const PANEL_PARENT = { availability: 'main', more: 'main', hours: 'availability', custom: 'availability', oneoff: 'availability', range: 'availability' };
const PANEL_TITLE = { availability: 'Availability', more: 'More options', hours: 'Working hours', custom: 'Custom schedule', oneoff: 'Date and time', range: 'Date range' };
const EVENT_KINDS = [
  { value: 'one_on_one', label: 'One-on-one', hint: 'One guest per time', icon: User },
  { value: 'group', label: 'Group', hint: 'Several guests per time', icon: Users },
  { value: 'one_off', label: 'One-off', hint: 'A time outside your regular schedule', icon: CalendarClock },
];
const NOTICE_UNITS = { min: 1, hours: 60, days: 1440 };
const NOTE_MAX = 2000;
const QUESTIONS_MAX = 10;
const QUESTION_TYPES = [
  { value: 'text', label: 'One line' },
  { value: 'long_text', label: 'Paragraph' },
  { value: 'dropdown', label: 'Dropdown' },
  { value: 'multiple_choice', label: 'Choose one' },
];
const hasChoices = (type) => type === 'dropdown' || type === 'multiple_choice';
const clampNumber = (value, min, max, fallback) => Math.min(max, Math.max(min, Number(value) || fallback));
const noticeText = (value, unit) => {
  const n = Number(value) || 0;
  if (!n) return 'no notice';
  if (unit === 'min') return `${n} min notice`;
  return `${n} ${unit === 'hours' ? (n === 1 ? 'hour' : 'hours') : (n === 1 ? 'day' : 'days')} notice`;
};
const ruleTime = (t) => { const [h, m] = (t || '0:0').split(':').map(Number); return minutesToLabel(h * 60 + m); };

// A row that opens another panel: what it is, what it's set to now, and a tick when it's in use
function PanelRow({ title, summary, selected, onClick }) {
  return (
    <button type="button" onClick={onClick} className="flex min-h-16 w-full items-center gap-3 rounded-lg border border-input px-4 py-3 text-left transition-all duration-200 hover:border-border-hover">
      <span className="min-w-0 flex-1">
        <span className="block text-sm font-semibold text-foreground">{title}</span>
        <span className="block text-sm text-muted-foreground">{summary}</span>
      </span>
      {selected && <Check className="h-4 w-4 shrink-0 text-link" strokeWidth={3} aria-label="In use" />}
      <ChevronRight className="h-4 w-4 shrink-0 text-muted-foreground" aria-hidden="true" />
    </button>
  );
}

// event: the event type being edited; template: { data } to start a new one from
export function EventModal({ event, template, hostId, onClose, onSave, onSaveTemplate, onPickTemplate }) {
  const [saving, setSaving] = useState(false);
  const [savingTemplate, setSavingTemplate] = useState(false);
  const [error, setError] = useState('');
  const today = formatDate(new Date());
  const src = event || template?.data || {};
  const known = LOCATIONS.find((l) => l.value === src.location);
  const [confirmDiscard, setConfirmDiscard] = useState(false);
  const [panel, setPanel] = useState('main');
  const [form, setForm] = useState(() => {
    const srcDays = src.days?.length ? [...src.days].sort() : null;
    const srcFreq = ['day', 'week', 'month'].includes(src.freq) ? src.freq : 'week';
    // new events start bookable from 30 minutes away; existing ones keep what they have
    const notice = src.min_notice ?? (event ? 0 : 30);
    const noticeUnit = notice && notice % 1440 === 0 ? 'days' : notice && notice % 60 === 0 ? 'hours' : 'min';
    return {
      kind: src.booking_type === 'group' ? 'group' : src.schedule === 'dates' && src.fixed_times?.length ? 'one_off' : 'one_on_one',
      name: src.name || '',
      description: (src.description || '').slice(0, DESCRIPTION_MAX),
      note: src.note || '',
      duration: src.duration || 30,
      location: known ? known.value : src.location ? 'Other' : 'Google Meet',
      custom_location: known ? '' : src.location || '',
      meeting_url: src.meeting_url || '',
      address: src.address || '',
      max_attendees: src.max_attendees > 1 ? src.max_attendees : 2,
      active: event?.active ?? true,
      requires_approval: src.requires_approval ?? false,
      email_required: src.email_required ?? true,
      // 'hours': whenever the host's working hours are open; 'custom': the schedule set below
      avail: src.schedule === 'dates' || src.fixed_times?.length || srcFreq !== 'week' || (src.every || 1) > 1 || (srcDays && srcDays.length < 7) ? 'custom' : 'hours',
      schedule: src.schedule === 'dates' ? 'dates' : 'weekly',
      freq: srcFreq,
      every: src.every || 1,
      days: srcDays || ALL_DAYS,
      // 'rolling': the next max_future_days days; 'dates': from start_date to end_date
      range: src.end_date ? 'dates' : 'rolling',
      max_future_days: src.max_future_days || 60,
      start_date: src.start_date || today,
      end_date: src.end_date || '',
      dates: src.dates ? [...src.dates].sort() : [],
      notice_value: notice / NOTICE_UNITS[noticeUnit],
      notice_unit: noticeUnit,
      // 'hours': any free time inside the host's hours; 'fixed': only these start times
      times: src.fixed_times?.length ? 'fixed' : 'hours',
      fixed_times: src.fixed_times?.length ? [...src.fixed_times].sort() : ['09:00'],
      custom_questions: (src.custom_questions || []).map((q) => ({ text: q.text || '', type: q.type || 'text', required: !!q.required, options: (q.options || []).join('\n') })),
      limit_on: src.max_per_day > 0,
      max_per_day: src.max_per_day || 5,
      buffer_before: src.buffer_before || 0,
      buffer_after: src.buffer_after || 0,
    };
  });
  const initialForm = useRef(null);
  if (initialForm.current === null) initialForm.current = JSON.stringify(form);
  const dirty = JSON.stringify(form) !== initialForm.current;
  const requestClose = () => { if (dirty && !saving) setConfirmDiscard(true); else onClose(); };
  const [customDuration, setCustomDuration] = useState(() => !DURATIONS.includes(Number(src.duration) || 30));
  const setField = (field, value) => setForm((current) => ({ ...current, [field]: value }));
  const kind = LOCATIONS.find((l) => l.value === form.location)?.kind;
  const every = Math.max(1, Number(form.every) || 1);
  const toggleDay = (dow) => { pickedDays.current = true; setField('days', form.days.includes(dow) ? form.days.filter((d) => d !== dow) : [...form.days, dow].sort()); };

  // What the choices above add up to: a one-off is specific dates at fixed times, and working
  // hours are every day the host's hours are open
  const oneOff = form.kind === 'one_off';
  const usesHours = !oneOff && form.avail === 'hours';
  const schedule = oneOff ? 'dates' : usesHours ? 'weekly' : form.schedule;
  const repeats = schedule === 'weekly';
  const fixedTimes = oneOff || (!usesHours && form.times === 'fixed');
  const freq = usesHours ? 'week' : form.freq;
  const everyN = usesHours ? 1 : every;
  const days = usesHours ? ALL_DAYS : form.days;
  const endDate = repeats && form.range === 'dates' ? form.end_date : null;
  const preview = { ...form, schedule, freq, every: everyN, days, end_date: endDate };

  useEffect(() => { setError(''); }, [form]);

  // moving between panels starts at the top of the new one, with focus there
  const panelRef = useRef(null);
  const goTo = (next) => { setError(''); setPanel(next); };
  useEffect(() => {
    if (panel === 'main' && !panelRef.current?.dataset.visited) return;
    panelRef.current?.focus();
    panelRef.current?.scrollIntoView({ block: 'nearest' });
  }, [panel]);
  useEffect(() => { if (panelRef.current) panelRef.current.dataset.visited = 'yes'; });

  // The host's hours, to show under Working hours and flag days nobody can book
  const [hours, setHours] = useState(null);
  useEffect(() => {
    Promise.all([
      api.entities.AvailabilityRule.filter({ created_by_id: hostId }, undefined, undefined, 'day_of_week, start_time, end_time'),
      api.entities.AvailabilityException.filter({ created_by_id: hostId }, undefined, undefined, 'date, type'),
    ]).then(([rules, exceptions]) => setHours({
      rules,
      days: new Set(rules.map((r) => r.day_of_week)),
      dates: new Set(exceptions.filter((e) => e.type === 'available').map((e) => e.date)),
    })).catch(() => {});
  }, []);
  const pickedDays = useRef(false);
  useEffect(() => {
    if (!hours || event || src.days?.length || pickedDays.current || !hours.days.size) return;
    const hostDays = [...hours.days].sort();
    setForm((f) => ({ ...f, days: hostDays }));
    initialForm.current = JSON.stringify({ ...JSON.parse(initialForm.current), days: hostDays });
  }, [hours]);
  const dateHasHours = (key) => fixedTimes || !hours || hours.dates.has(key) || hours.days.has(new Date(`${key}T00:00`).getDay());
  const closedDays = hours && !fixedTimes && !usesHours && freq === 'week' ? form.days.filter((d) => !hours.days.has(d)) : [];

  // No day in the coming year both runs and has hours: guests would find nothing to book
  const nothingToBook = (() => {
    if (!hours || (schedule === 'dates' && !form.dates.length)) return false;
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
      else if (!form.address && list[0]) {
        setAddressChoice(list[0].id);
        setField('address', list[0].address);
        // a prefill, not an edit: closing without changes shouldn't ask to discard
        initialForm.current = JSON.stringify({ ...JSON.parse(initialForm.current), address: list[0].address });
      }
    }).catch(() => setSavedAddressesAvailable(false));
  }, []);
  const pickAddress = (choice) => {
    setAddressChoice(choice);
    const a = addresses.find((x) => x.id === choice);
    setField('address', a ? a.address : '');
  };

  const setQuestion = (i, field, value) => setField('custom_questions', form.custom_questions.map((q, j) => (j === i ? { ...q, [field]: value } : q)));
  const cleanOptions = (q) => [...new Set(q.options.split('\n').map((o) => o.trim()).filter(Boolean))].slice(0, 20);

  const submit = async (submitEvent) => {
    submitEvent.preventDefault();
    // Enter inside a panel goes back rather than saving a form you can't see
    if (panel !== 'main') { goTo(PANEL_PARENT[panel]); return; }
    setError('');
    // names the problem, and opens the panel that holds it
    const fail = (message, where) => { setError(message); if (where) setPanel(where); };
    if (kind === 'in_person' && !form.address.trim()) { fail('Add the address where you will meet.'); return; }
    if (kind === 'other' && !form.custom_location.trim()) { fail('Describe where the meeting happens.'); return; }
    if (repeats && freq === 'week' && !days.length) { fail('Pick at least one day the event repeats on.', 'custom'); return; }
    if (repeats && !form.start_date) { fail('Pick the date the event starts.', form.range === 'dates' ? 'range' : 'custom'); return; }
    if (endDate === '') { fail('Pick the last date, or use a rolling range.', 'range'); return; }
    if (endDate && endDate < form.start_date) { fail('The last date is before the first date.', 'range'); return; }
    if (!repeats && !form.dates.length) { fail(oneOff ? 'Pick the date for this one-off meeting.' : 'Pick at least one date.', oneOff ? 'oneoff' : 'custom'); return; }
    if (fixedTimes && !form.fixed_times.some(Boolean)) { fail('Add at least one start time.', oneOff ? 'oneoff' : 'custom'); return; }
    // a meeting must end by midnight (the booking page and the server never offer one that runs past it)
    const duration = Math.min(720, Math.max(5, Number(form.duration) || 30));
    if (fixedTimes && form.fixed_times.some((t) => t && Number(t.slice(0, 2)) * 60 + Number(t.slice(3, 5)) + duration > 24 * 60)) {
      fail('A start time is too late for a meeting this long to end by midnight.', oneOff ? 'oneoff' : 'custom'); return;
    }
    if (form.custom_questions.some((q) => !q.text.trim())) { fail('Write each invitee question, or remove the empty one.', 'more'); return; }
    if (form.custom_questions.some((q) => hasChoices(q.type) && !cleanOptions(q).length)) { fail('Add the answers guests can choose from.', 'more'); return; }
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
    const { kind: _kind, avail: _avail, range: _range, notice_value, notice_unit, limit_on, custom_location, times: _times, ...rest } = form;
    return {
      ...rest,
      booking_type: form.kind === 'group' ? 'group' : 'one_on_one',
      schedule,
      freq,
      every: everyN,
      days: repeats && freq === 'week' && days.length < 7 ? days : null,
      start_date: repeats ? form.start_date : null,
      end_date: endDate,
      dates: repeats ? null : form.dates,
      fixed_times: fixedTimes ? [...new Set(form.fixed_times.filter(Boolean))].sort() : null,
      location: kind === 'other' ? custom_location.trim() : form.location,
      meeting_url: kind === 'video' || kind === 'other' ? form.meeting_url.trim() : '',
      address: kind === 'in_person' ? form.address.trim() : null,
      duration: Math.min(720, Math.max(5, Number(form.duration) || 30)),
      max_attendees: form.kind === 'group' ? Math.min(500, Math.max(2, Number(form.max_attendees) || 2)) : 1,
      note: form.note.trim() || null,
      max_future_days: clampNumber(form.max_future_days, 1, 730, 60),
      min_notice: Math.max(0, Number(notice_value) || 0) * NOTICE_UNITS[notice_unit],
      max_per_day: limit_on ? clampNumber(form.max_per_day, 1, 100, 5) : null,
      buffer_before: clampNumber(form.buffer_before, 0, 1440, 0),
      buffer_after: clampNumber(form.buffer_after, 0, 1440, 0),
      custom_questions: form.custom_questions.map((q) => ({
        text: q.text.trim(), type: q.type, required: q.required, ...(hasChoices(q.type) ? { options: cleanOptions(q) } : {}),
      })),
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

  const notice = noticeText(form.notice_value, form.notice_unit);
  const rangeSummary = !repeats
    ? `On the dates you pick, ${notice}`
    : form.range === 'dates'
      ? `${form.start_date ? shortDate(form.start_date) : 'Pick a date'} to ${form.end_date ? shortDate(form.end_date) : 'pick a date'}, ${notice}`
      : `Next ${form.max_future_days || 60} calendar days, ${notice}`;
  const availabilitySummary = oneOff
    ? (form.dates.length ? `${scheduleSummary({ ...preview, fixed_times: form.fixed_times.filter(Boolean) })}, ${notice}` : 'Pick a date and time')
    : `${usesHours ? 'Working hours' : 'Custom schedule'}. ${rangeSummary}`;
  const moreParts = [
    form.description.trim() && 'Description',
    form.note.trim() && 'Internal note',
    form.custom_questions.length && `${form.custom_questions.length} ${form.custom_questions.length === 1 ? 'question' : 'questions'}`,
    form.limit_on && `Up to ${form.max_per_day} a day`,
    (Number(form.buffer_before) > 0 || Number(form.buffer_after) > 0) && 'Buffers',
  ].filter(Boolean);

  const startTimesEditor = (
    <div className="space-y-2">
      {form.fixed_times.map((t, i) => (
        <div key={i} className="flex items-center gap-2">
          <TimeSelect
            aria-label={`Start time ${i + 1}`}
            placeholder="Pick a time"
            value={t}
            onChange={(v) => setField('fixed_times', form.fixed_times.map((x, j) => (j === i ? v : x)))}
            className="w-40"
          />
          {form.fixed_times.length > 1 && (
            <button type="button" aria-label={`Remove start time ${i + 1}`} onClick={() => setField('fixed_times', form.fixed_times.filter((_, j) => j !== i))}
              className="w-9 h-9 rounded-full flex items-center justify-center text-muted-foreground transition-all duration-200 hover:bg-secondary hover:text-foreground">
              <X className="w-4 h-4" />
            </button>
          )}
        </div>
      ))}
      {/* the database keeps at most 48 start times */}
      {form.fixed_times.length < 48 && (
        <button type="button" onClick={() => setField('fixed_times', [...form.fixed_times, ''])} className="text-sm font-semibold text-link hover:underline">+ Add a start time</button>
      )}
    </div>
  );

  const datesEditor = (
    <div className="grid gap-4 sm:grid-cols-[auto_1fr]">
      <MultiDatePicker value={form.dates} onChange={(v) => setField('dates', v)} min={today} labelledBy="event-dates-label" />
      <div className="min-w-0">
        <p id="event-dates-label" className="mb-2 text-sm text-muted-foreground">{form.dates.length ? `${form.dates.length} ${form.dates.length === 1 ? 'date' : 'dates'} picked` : 'Pick the days guests can book'}</p>
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
  );

  const nothingToBookNote = nothingToBook && (
    <p role="alert" className="rounded-lg border border-warning px-3.5 py-2.5 text-sm text-warning">
      No upcoming day fits these settings and your hours, so guests can’t book this event. Check the days and dates, or your hours in Availability.
    </p>
  );

  return (
    <>
    <Dialog open onOpenChange={(next) => { if (!next) requestClose(); }}>
      <DialogContent showCloseButton={false} aria-describedby={undefined} className="sm:max-w-xl p-0 sm:pb-0 block">
        <div className="sticky top-0 z-10 flex items-center gap-2 border-b border-border bg-popover px-6 py-4">
          {panel !== 'main' && (
            <button type="button" aria-label={`Back to ${PANEL_PARENT[panel] === 'main' ? 'the event' : 'Availability'}`} onClick={() => goTo(PANEL_PARENT[panel])} className="-ml-2 w-8 h-8 rounded-full flex items-center justify-center text-muted-foreground hover:bg-secondary">
              <ArrowLeft className="w-4 h-4" />
            </button>
          )}
          <DialogTitle className="min-w-0 flex-1">{panel !== 'main' ? PANEL_TITLE[panel] : event ? 'Edit event type' : 'New event type'}</DialogTitle>
          {panel === 'main' && !event && !dirty && onPickTemplate && (
            <button type="button" onClick={onPickTemplate} className="h-8 shrink-0 px-2 text-sm font-semibold text-link hover:underline">Use a template</button>
          )}
          <button type="button" aria-label="Close" onClick={requestClose} className="w-8 h-8 rounded-full flex items-center justify-center text-muted-foreground hover:bg-secondary"><X className="w-4 h-4" /></button>
        </div>
        <form onSubmit={submit} noValidate={panel !== 'main'} className="px-6 pt-5">
          <div ref={panelRef} tabIndex={-1} className="space-y-5 outline-none">
          {panel === 'main' && (
            <>
              <fieldset>
                <legend className="mb-2 text-sm font-semibold text-foreground">Event type</legend>
                <div className="grid gap-2 sm:grid-cols-3">
                  {EVENT_KINDS.map(({ value, label, hint, icon: Icon }) => {
                    const on = form.kind === value;
                    return (
                      <button key={value} type="button" aria-pressed={on} onClick={() => setField('kind', value)}
                        className={cn('flex items-center gap-3 rounded-lg border px-3 py-2 text-left transition-all duration-200 sm:block sm:py-3', on ? 'border-primary bg-primary-soft' : 'border-input hover:border-border-hover')}>
                        <Icon className={cn('h-5 w-5 shrink-0', on ? 'text-link' : 'text-muted-foreground')} aria-hidden="true" />
                        <span className="min-w-0">
                          <span className={cn('block text-sm font-semibold sm:mt-2', on ? 'text-link' : 'text-foreground')}>{label}</span>
                          <span className="block text-xs leading-snug text-muted-foreground">{hint}</span>
                        </span>
                      </button>
                    );
                  })}
                </div>
                {form.kind === 'group' && (
                  <div className="mt-3 flex items-center justify-between gap-4">
                    <label htmlFor="event-capacity" className="text-sm font-semibold">Spots per time</label>
                    <Stepper id="event-capacity" value={form.max_attendees} onChange={(v) => setField('max_attendees', v)} min={2} max={500} className="w-32" />
                  </div>
                )}
              </fieldset>

              <div>
                <GlassLabel htmlFor="event-name">Name</GlassLabel>
                <GlassInput id="event-name" value={form.name} maxLength={LIMITS.title} onChange={(e) => setField('name', onlyTitle(e.target.value))} placeholder="30 minute meeting" required />
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
                          <GlassInput maxLength={LIMITS.label} value={newAddressLabel} onChange={(e) => setNewAddressLabel(onlyTitle(e.target.value))} placeholder="Label, e.g. Office (optional)" aria-label="Address label" />
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
                  <GlassInput id="event-custom-location" maxLength={LIMITS.title} value={form.custom_location} onChange={(e) => setField('custom_location', onlyTitle(e.target.value))} placeholder="e.g. Webex, Signal" required />
                </div>
              )}
              {(kind === 'video' || kind === 'other') && (
                <div>
                  <GlassLabel htmlFor="event-meeting-url">Meeting link (optional)</GlassLabel>
                  <GlassInput id="event-meeting-url" type="url" inputMode="url" maxLength={LIMITS.url} value={form.meeting_url} onChange={(e) => setField('meeting_url', e.target.value)} placeholder="https://" />
                </div>
              )}
              {kind === 'phone' && (
                <p className="rounded-lg bg-secondary px-3.5 py-3 text-sm text-muted-foreground">You call the guest on the WhatsApp number they give when booking.</p>
              )}

              <div className="space-y-2">
                <PanelRow title="Availability" summary={availabilitySummary} onClick={() => goTo('availability')} />
                <PanelRow title="More options" summary={moreParts.length ? moreParts.join(', ') : 'Description, internal note, invitee questions, time limits and buffers'} onClick={() => goTo('more')} />
              </div>
              {nothingToBookNote}
            </>
          )}

          {panel === 'availability' && (
            <div className="space-y-2">
              {oneOff ? (
                <PanelRow title="Date and time" summary={form.dates.length ? scheduleSummary({ ...preview, fixed_times: form.fixed_times.filter(Boolean) }) : 'A time outside your regular schedule'} onClick={() => goTo('oneoff')} />
              ) : (
                <>
                  <PanelRow title="Working hours" summary="Your weekly hours from Availability" selected={usesHours} onClick={() => { setField('avail', 'hours'); goTo('hours'); }} />
                  <PanelRow title="Custom schedule" summary={usesHours ? 'Days and times just for this event' : scheduleSummary(preview)} selected={!usesHours} onClick={() => { setField('avail', 'custom'); goTo('custom'); }} />
                </>
              )}
              <PanelRow title="Date range" summary={rangeSummary} onClick={() => goTo('range')} />
              <div className="pt-3">{nothingToBookNote}</div>
            </div>
          )}

          {panel === 'hours' && (
            <div className="space-y-3">
              <p className="text-sm text-muted-foreground">Guests pick any free time inside these hours. Changing them here changes them for every event that uses working hours.</p>
              {!hours ? <Spinner /> : (
                <ul className="divide-y divide-border rounded-lg border border-border px-4 text-sm">
                  {WEEKDAYS.map((label, dow) => {
                    const ranges = hours.rules.filter((r) => r.day_of_week === dow);
                    return (
                      <li key={label} className="flex items-center justify-between gap-4 py-2.5">
                        <span className="font-semibold">{label}</span>
                        <span className={cn('tabular text-right', ranges.length ? 'text-muted-foreground' : 'text-hint')}>
                          {ranges.length ? ranges.map((r) => `${ruleTime(r.start_time)} – ${ruleTime(r.end_time)}`).join(', ') : 'Unavailable'}
                        </span>
                      </li>
                    );
                  })}
                </ul>
              )}
              <a href={appPath('/availability')} target="_blank" rel="noreferrer" className="inline-flex items-center gap-1.5 text-sm font-semibold text-link hover:underline">Change working hours <ExternalLink className="h-3.5 w-3.5" /></a>
              {nothingToBookNote}
            </div>
          )}

          {panel === 'custom' && (
            <>
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
                    {form.freq === 'week' ? (
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
                    ) : (
                      <div className="sm:w-1/2">
                        <GlassLabel htmlFor="event-start">Starts</GlassLabel>
                        <DatePicker id="event-start" value={form.start_date} onChange={(v) => setField('start_date', v)} />
                      </div>
                    )}
                    <p className="rounded-lg bg-secondary px-3.5 py-2.5 text-sm text-foreground" aria-live="polite">
                      {scheduleSummary(preview)}
                      {form.start_date > today && `, starting ${shortDate(form.start_date)}`}
                      {form.freq === 'month' && Number(form.start_date.slice(8)) > 28 && '. Shorter months use their last day.'}
                    </p>
                    {closedDays.length > 0 && (
                      <p className="text-sm text-warning">No weekly hours on {closedDays.map((d) => WEEKDAYS[d]).join(', ')}, so guests can’t book those days. Add hours in Availability.</p>
                    )}
                  </div>
                ) : (
                  <div className="mt-4">{datesEditor}</div>
                )}
              </fieldset>
              <fieldset>
                <legend className="mb-2 text-sm font-semibold text-foreground">Times</legend>
                <div className="flex flex-wrap gap-2">
                  <button type="button" aria-pressed={form.times === 'hours'} onClick={() => setField('times', 'hours')} className={pillClass(form.times === 'hours')}>From my hours</button>
                  <button type="button" aria-pressed={form.times === 'fixed'} onClick={() => setField('times', 'fixed')} className={pillClass(form.times === 'fixed')}>Fixed times</button>
                </div>
                {form.times === 'fixed' ? (
                  <div className="mt-3 space-y-2">
                    {startTimesEditor}
                    <p className="text-xs text-muted-foreground">Guests can only book these start times, in your time zone, on the days above. Your weekly hours don’t apply; days or hours you block off in Availability still do.</p>
                  </div>
                ) : (
                  <p className="mt-3 text-xs text-muted-foreground">Guests pick any free time inside your hours in Availability.</p>
                )}
              </fieldset>
              {nothingToBookNote}
            </>
          )}

          {panel === 'oneoff' && (
            <>
              <p className="text-sm text-muted-foreground">Offer a time outside your regular schedule. Your weekly hours don’t apply; days or hours you block off in Availability still do.</p>
              <fieldset>
                <legend className="mb-2 text-sm font-semibold text-foreground">Date</legend>
                {datesEditor}
              </fieldset>
              <fieldset>
                <legend className="mb-2 text-sm font-semibold text-foreground">Start time</legend>
                {startTimesEditor}
              </fieldset>
            </>
          )}

          {panel === 'range' && (
            <>
              {repeats ? (
                <fieldset>
                  <legend className="mb-2 text-sm font-semibold text-foreground">When guests can book</legend>
                  <div className="flex flex-wrap gap-2">
                    <button type="button" aria-pressed={form.range === 'rolling'} onClick={() => setField('range', 'rolling')} className={pillClass(form.range === 'rolling')}>Rolling days</button>
                    <button type="button" aria-pressed={form.range === 'dates'} onClick={() => setField('range', 'dates')} className={pillClass(form.range === 'dates')}>Between two dates</button>
                  </div>
                  {form.range === 'rolling' ? (
                    <div className="mt-3 flex flex-wrap items-center gap-2">
                      <Stepper value={form.max_future_days} onChange={(v) => setField('max_future_days', v)} min={1} max={730} aria-label="Rolling calendar days" className="w-32" />
                      <span className="text-sm font-semibold">calendar days into the future</span>
                    </div>
                  ) : (
                    <div className="mt-3 grid gap-3 sm:grid-cols-2">
                      <div>
                        <GlassLabel htmlFor="event-range-start">From</GlassLabel>
                        <DatePicker id="event-range-start" value={form.start_date} onChange={(v) => setField('start_date', v)} />
                      </div>
                      <div>
                        <GlassLabel htmlFor="event-end">To</GlassLabel>
                        <DatePicker id="event-end" value={form.end_date} min={form.start_date || today} onChange={(v) => setField('end_date', v)} />
                      </div>
                    </div>
                  )}
                </fieldset>
              ) : (
                <p className="rounded-lg bg-secondary px-3.5 py-3 text-sm text-muted-foreground">Guests can book on the dates you picked.</p>
              )}
              <fieldset>
                <legend className="mb-2 text-sm font-semibold text-foreground">Minimum notice</legend>
                <div className="flex flex-wrap items-center gap-2">
                  <Stepper value={form.notice_value} onChange={(v) => setField('notice_value', v)} min={0} max={999} aria-label="Minimum notice" className="w-32" />
                  <GlassSelect value={form.notice_unit} onChange={(e) => setField('notice_unit', e.target.value)} aria-label="Notice unit" className="w-32">
                    <option value="min">minutes</option>
                    <option value="hours">hours</option>
                    <option value="days">days</option>
                  </GlassSelect>
                </div>
                <p className="mt-2 text-xs text-muted-foreground">Guests can’t book a time closer than this.</p>
              </fieldset>
            </>
          )}

          {panel === 'more' && (
            <>
              <div>
                <div className="flex items-center justify-between">
                  <GlassLabel htmlFor="event-description">Description</GlassLabel>
                  <span className={`mb-2 text-xs tabular ${form.description.length >= DESCRIPTION_MAX ? 'text-destructive' : 'text-muted-foreground'}`}>{form.description.length}/{DESCRIPTION_MAX}</span>
                </div>
                <GlassTextarea id="event-description" rows={3} maxLength={DESCRIPTION_MAX} value={form.description} onChange={(e) => setField('description', e.target.value.slice(0, DESCRIPTION_MAX))} placeholder="What guests can expect" />
              </div>

              <div>
                <GlassLabel htmlFor="event-note">Internal note</GlassLabel>
                <GlassTextarea id="event-note" rows={2} maxLength={NOTE_MAX} value={form.note} onChange={(e) => setField('note', e.target.value)} placeholder="Only you can see this" />
                <p className="mt-1.5 text-xs text-muted-foreground">Guests never see this.</p>
              </div>

              <fieldset>
                <legend className="mb-2 text-sm font-semibold text-foreground">Invitee questions</legend>
                <div className="space-y-3">
                  {form.custom_questions.map((q, i) => (
                    <div key={i} className="space-y-3 rounded-lg border border-border p-3.5">
                      <div className="flex items-center gap-2">
                        <GlassInput value={q.text} maxLength={200} onChange={(e) => setQuestion(i, 'text', e.target.value)} placeholder="Your question" aria-label={`Question ${i + 1}`} />
                        <button type="button" aria-label={`Remove question ${i + 1}`} onClick={() => setField('custom_questions', form.custom_questions.filter((_, j) => j !== i))}
                          className="w-9 h-9 shrink-0 rounded-full flex items-center justify-center text-muted-foreground transition-all duration-200 hover:bg-secondary hover:text-foreground">
                          <Trash2 className="w-4 h-4" />
                        </button>
                      </div>
                      <div className="flex flex-wrap items-center justify-between gap-3">
                        <GlassSelect value={q.type} onChange={(e) => setQuestion(i, 'type', e.target.value)} aria-label={`Answer type for question ${i + 1}`} className="w-40">
                          {QUESTION_TYPES.map((t) => <option key={t.value} value={t.value}>{t.label}</option>)}
                        </GlassSelect>
                        <label className="flex items-center gap-2 text-sm font-semibold">
                          <Switch checked={q.required} onCheckedChange={(v) => setQuestion(i, 'required', v)} aria-label={`Require an answer to question ${i + 1}`} /> Required
                        </label>
                      </div>
                      {hasChoices(q.type) && (
                        <GlassTextarea rows={3} maxLength={2000} value={q.options} onChange={(e) => setQuestion(i, 'options', e.target.value)} placeholder="One answer per line" aria-label={`Answers for question ${i + 1}`} />
                      )}
                    </div>
                  ))}
                  {form.custom_questions.length < QUESTIONS_MAX && (
                    <button type="button" onClick={() => setField('custom_questions', [...form.custom_questions, { text: '', type: 'text', required: false, options: '' }])} className="text-sm font-semibold text-link hover:underline">+ Add a question</button>
                  )}
                </div>
              </fieldset>

              <fieldset>
                <legend className="mb-2 text-sm font-semibold text-foreground">Time limits</legend>
                <div className="rounded-lg border border-border px-4">
                  <ToggleRow id="ev-limit" label="Limit meetings per day" description="Stop taking bookings for this event once a day is full." checked={form.limit_on} onChange={(v) => setField('limit_on', v)} />
                  {form.limit_on && (
                    <div className="flex items-center justify-between gap-4 border-t border-border py-3">
                      <label htmlFor="event-per-day" className="text-sm font-semibold">Meetings per day</label>
                      <Stepper id="event-per-day" value={form.max_per_day} onChange={(v) => setField('max_per_day', v)} min={1} max={100} className="w-32" />
                    </div>
                  )}
                </div>
              </fieldset>

              <fieldset>
                <legend className="mb-2 text-sm font-semibold text-foreground">Buffers</legend>
                <div className="grid gap-3 sm:grid-cols-2">
                  <div>
                    <GlassLabel htmlFor="event-buffer-before">Before each meeting</GlassLabel>
                    <Stepper id="event-buffer-before" value={form.buffer_before} onChange={(v) => setField('buffer_before', v)} min={0} max={240} step={5} suffix="min" className="w-40" />
                  </div>
                  <div>
                    <GlassLabel htmlFor="event-buffer-after">After each meeting</GlassLabel>
                    <Stepper id="event-buffer-after" value={form.buffer_after} onChange={(v) => setField('buffer_after', v)} min={0} max={240} step={5} suffix="min" className="w-40" />
                  </div>
                </div>
                <p className="mt-2 text-xs text-muted-foreground">Time kept clear around this event’s meetings.</p>
              </fieldset>

              <div className="divide-y divide-border rounded-lg border border-border px-4">
                <ToggleRow id="ev-active" label="Active" description="Guests can book this event from its link." checked={form.active} onChange={(v) => setField('active', v)} />
                <ToggleRow id="ev-approval" label="Requires approval" description="You approve each booking before it is confirmed." checked={form.requires_approval} onChange={(v) => setField('requires_approval', v)} />
                <ToggleRow id="ev-email" label="Ask for email" description="Guests must enter an email address. Off: email is optional." checked={form.email_required} onChange={(v) => setField('email_required', v)} />
              </div>
            </>
          )}
          </div>

          {error && <p role="alert" className="mt-5 text-sm text-destructive">{error}</p>}
          {/* phones: two equal columns so the buttons can never overlap; wider: right-aligned */}
          <div className="sticky bottom-0 -mx-6 mt-5 grid grid-cols-2 gap-2 border-t border-border bg-popover px-6 pt-4 pb-[max(1rem,env(safe-area-inset-bottom))] sm:pb-4 sm:flex sm:justify-end">
            {panel === 'main' ? (
              <>
                {onSaveTemplate && (
                  <GlassButton type="button" variant="ghost" onClick={saveAsTemplate} disabled={savingTemplate} className="col-span-2 min-w-0 sm:mr-auto sm:px-3">
                    <FileText className="w-4 h-4" /> {savingTemplate ? 'Saving…' : 'Save as template'}
                  </GlassButton>
                )}
                <GlassButton type="button" variant="default" onClick={requestClose} className="min-w-0 sm:border-transparent sm:bg-transparent">Cancel</GlassButton>
                <GlassButton type="submit" variant="primary" disabled={saving} className="min-w-0">{saving ? 'Saving…' : event ? 'Save changes' : 'Create event type'}</GlassButton>
              </>
            ) : (
              <GlassButton type="button" variant="primary" onClick={() => goTo(PANEL_PARENT[panel])} className="col-span-2 min-w-0">Done</GlassButton>
            )}
          </div>
        </form>
      </DialogContent>
    </Dialog>
    {confirmDiscard && (
      <Dialog open onOpenChange={(next) => { if (!next) setConfirmDiscard(false); }}>
        <DialogContent showCloseButton={false} aria-describedby={undefined} className="sm:max-w-sm p-6 block">
          <DialogTitle>Discard your changes?</DialogTitle>
          <p className="mt-2 text-sm text-muted-foreground">You have changes to this event that aren't saved yet.</p>
          <div className="mt-6 flex justify-end gap-2">
            <GlassButton type="button" variant="ghost" onClick={() => setConfirmDiscard(false)}>Keep editing</GlassButton>
            <GlassButton type="button" variant="danger" onClick={onClose}>Discard</GlassButton>
          </div>
        </DialogContent>
      </Dialog>
    )}
    </>
  );
}

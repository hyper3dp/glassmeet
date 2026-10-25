import React, { useEffect, useState } from 'react';
import { useSearchParams, Link } from 'react-router-dom';
import { api } from '@/lib/localApi';
import { Plus, Clock, ExternalLink, Search, X } from 'lucide-react';
import { GlassCard, GlassButton, GlassInput, GlassTextarea, GlassLabel, GlassSelect, EmptyState, Spinner, PageHeader, Tabs, Avatar } from '@/components/glass';
import EventCard from '@/components/eventcard.jsx';
import { Dialog, DialogContent, DialogTitle } from '@/components/ui/dialog';
import { Switch } from '@/components/ui/switch';

export default function EventTypes({ profile }) {
  const [eventTypes, setEventTypes] = useState([]);
  const [loading, setLoading] = useState(true);
  const [showModal, setShowModal] = useState(false);
  const [editing, setEditing] = useState(null);
  const [query, setQuery] = useState('');
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
      const e = await api.entities.EventType.filter({ created_by_id: profile.id }, '-created_date');
      setEventTypes(e);
    } catch (err) {}
    setLoading(false);
  };

  const openNew = () => { setEditing(null); setShowModal(true); };
  const openEdit = (e) => { setEditing(e); setShowModal(true); };

  const handleDelete = async (id) => {
    if (!confirm('Delete this event type? Existing bookings remain.')) return;
    await api.entities.EventType.delete(id);
    setEventTypes(eventTypes.filter((e) => e.id !== id));
  };

  const handleToggle = async (ev, active) => {
    await api.entities.EventType.update(ev.id, { active });
    setEventTypes((list) => list.map((x) => (x.id === ev.id ? { ...x, active } : x)));
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
            <EventCard key={e.id} event={e} onEdit={() => openEdit(e)} onDelete={() => handleDelete(e.id)} onToggle={(active) => handleToggle(e, active)} />
          ))}
        </div>
      )}

      {showModal && (
        <EventModal
          event={editing}
          onClose={() => setShowModal(false)}
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

const DESCRIPTION_MAX = 500;
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

function EventModal({ event, onClose, onSave }) {
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  const known = LOCATIONS.find((l) => l.value === event?.location);
  const [form, setForm] = useState(() => ({
    name: event?.name || '',
    description: (event?.description || '').slice(0, DESCRIPTION_MAX),
    duration: event?.duration || 30,
    location: known ? known.value : event?.location ? 'Other' : 'Google Meet',
    custom_location: known ? '' : event?.location || '',
    meeting_url: event?.meeting_url || '',
    address: event?.address || '',
    booking_type: event?.booking_type || 'one_on_one',
    max_attendees: event?.max_attendees || 2,
    active: event?.active ?? true,
    requires_approval: event?.requires_approval ?? false,
    email_required: event?.email_required ?? true,
  }));
  const [customDuration, setCustomDuration] = useState(() => !DURATIONS.includes(event?.duration || 30));
  const setField = (field, value) => setForm((current) => ({ ...current, [field]: value }));
  const kind = LOCATIONS.find((l) => l.value === form.location)?.kind;

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
    setSaving(true);
    try {
      if (kind === 'in_person' && addressChoice === 'new' && saveNewAddress && savedAddressesAvailable) {
        const saved = await api.entities.Address.create({ label: newAddressLabel.trim(), address: form.address.trim() });
        setAddresses((list) => [...list, saved]);
        setAddressChoice(saved.id);
      }
      const { custom_location, ...rest } = form;
      await onSave({
        ...rest,
        location: kind === 'other' ? custom_location.trim() : form.location,
        meeting_url: kind === 'video' || kind === 'other' ? form.meeting_url.trim() : '',
        address: kind === 'in_person' ? form.address.trim() : null,
        duration: Number(form.duration),
        max_attendees: form.booking_type === 'group' ? Number(form.max_attendees) : 1,
      });
    } catch (e) {
      setError(e.message || 'Could not save this event type.');
    } finally {
      setSaving(false);
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
                    className={`h-9 px-4 rounded-full border text-sm font-semibold transition-all duration-200 ${on ? 'border-primary bg-primary-soft text-link' : 'border-input text-foreground hover:border-border-hover'}`}>
                    {d < 60 ? `${d} min` : d === 60 ? '1 hr' : '1.5 hr'}
                  </button>
                );
              })}
              <button type="button" aria-pressed={customDuration} onClick={() => setCustomDuration(true)}
                className={`h-9 px-4 rounded-full border text-sm font-semibold transition-all duration-200 ${customDuration ? 'border-primary bg-primary-soft text-link' : 'border-input text-foreground hover:border-border-hover'}`}>
                Custom
              </button>
            </div>
            {customDuration && (
              <div className="mt-3 flex items-center gap-2">
                <GlassInput type="number" inputMode="numeric" min="5" max="720" step="5" value={form.duration} onChange={(e) => setField('duration', e.target.value)} className="w-28" aria-label="Custom duration in minutes" required />
                <span className="text-sm text-muted-foreground">minutes</span>
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
                <GlassInput id="event-capacity" type="number" inputMode="numeric" min="2" max="500" value={form.max_attendees} onChange={(e) => setField('max_attendees', e.target.value)} className="w-24 text-center" />
              </div>
            )}
            <ToggleRow id="ev-active" label="Active" description="Guests can book this event from its link." checked={form.active} onChange={(v) => setField('active', v)} />
            <ToggleRow id="ev-approval" label="Requires approval" description="You approve each booking before it is confirmed." checked={form.requires_approval} onChange={(v) => setField('requires_approval', v)} />
            <ToggleRow id="ev-email" label="Ask for email" description="Guests must enter an email address. Off: email is optional." checked={form.email_required} onChange={(v) => setField('email_required', v)} />
          </div>

          {error && <p role="alert" className="text-sm text-destructive">{error}</p>}
          {/* phones: two equal columns so the buttons can never overlap; wider: right-aligned */}
          <div className="sticky bottom-0 -mx-6 grid grid-cols-2 gap-2 border-t border-border bg-popover px-6 pt-4 pb-[max(1rem,env(safe-area-inset-bottom))] sm:pb-4 sm:flex sm:justify-end">
            <GlassButton type="button" variant="default" onClick={onClose} className="min-w-0 sm:border-transparent sm:bg-transparent">Cancel</GlassButton>
            <GlassButton type="submit" variant="primary" disabled={saving} className="min-w-0">{saving ? 'Saving…' : event ? 'Save changes' : 'Create event type'}</GlassButton>
          </div>
        </form>
      </DialogContent>
    </Dialog>
  );
}

import React, { useEffect, useState } from 'react';
import { useSearchParams, Link } from 'react-router-dom';
import { api } from '@/lib/localApi';
import { Plus, Clock, ExternalLink, Search, X } from 'lucide-react';
import { GlassCard, GlassButton, GlassInput, GlassTextarea, GlassLabel, GlassSelect, EmptyState, Spinner, PageHeader, Tabs, Avatar } from '@/components/glass';
import EventCard from '@/components/eventcard.jsx';
import { Dialog, DialogContent, DialogTitle } from '@/components/ui/dialog';

export default function EventTypes({ profile }) {
  const [eventTypes, setEventTypes] = useState([]);
  const [loading, setLoading] = useState(true);
  const [showModal, setShowModal] = useState(false);
  const [editing, setEditing] = useState(null);
  const [query, setQuery] = useState('');
  const [searchParams, setSearchParams] = useSearchParams();

  useEffect(() => {
    load();
    if (searchParams.get('new') === 'true') {
      openNew();
      setSearchParams({});
    }
  }, []);

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
            if (editing) await api.entities.EventType.update(editing.id, payload);
            else await api.entities.EventType.create(payload);
            setShowModal(false);
            await load();
          }}
        />
      )}
    </div>
  );
}

function EventModal({ event, onClose, onSave }) {
  const [saving, setSaving] = useState(false);
  const [form, setForm] = useState(() => ({
    name: event?.name || '',
    description: event?.description || '',
    duration: event?.duration || 30,
    location: event?.location || 'Online',
    meeting_url: event?.meeting_url || '',
    booking_type: event?.booking_type || 'one_on_one',
    max_attendees: event?.max_attendees || 1,
    active: event?.active ?? true,
    requires_approval: event?.requires_approval ?? false,
  }));
  const setField = (field, value) => setForm((current) => ({ ...current, [field]: value }));
  const submit = async (submitEvent) => {
    submitEvent.preventDefault();
    setSaving(true);
    try {
      await onSave({ ...form, duration: Number(form.duration), max_attendees: Number(form.max_attendees) });
    } finally {
      setSaving(false);
    }
  };

  return (
    <Dialog open onOpenChange={(next) => { if (!next) onClose(); }}>
      <DialogContent showCloseButton={false} aria-describedby={undefined} className="max-w-xl p-6 block">
        <div className="mb-5 flex items-center justify-between">
          <DialogTitle>{event ? 'Edit event type' : 'New event type'}</DialogTitle>
          <button type="button" aria-label="Close" onClick={onClose} className="w-8 h-8 rounded-full flex items-center justify-center text-muted-foreground hover:bg-secondary"><X className="w-4 h-4" /></button>
        </div>
        <form onSubmit={submit} className="space-y-4">
          <div>
            <GlassLabel htmlFor="event-name">Name</GlassLabel>
            <GlassInput id="event-name" value={form.name} onChange={(e) => setField('name', e.target.value)} required autoFocus />
          </div>
          <div>
            <GlassLabel htmlFor="event-description">Description</GlassLabel>
            <GlassTextarea id="event-description" rows={3} value={form.description} onChange={(e) => setField('description', e.target.value)} />
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <GlassLabel htmlFor="event-duration">Duration (minutes)</GlassLabel>
              <GlassInput id="event-duration" type="number" min="5" step="5" value={form.duration} onChange={(e) => setField('duration', e.target.value)} required />
            </div>
            <div>
              <GlassLabel htmlFor="event-location">Location</GlassLabel>
              <GlassInput id="event-location" value={form.location} onChange={(e) => setField('location', e.target.value)} />
            </div>
          </div>
          <div>
            <GlassLabel htmlFor="event-meeting-url">Meeting link</GlassLabel>
            <GlassInput id="event-meeting-url" type="url" value={form.meeting_url} onChange={(e) => setField('meeting_url', e.target.value)} placeholder="https://" />
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <GlassLabel htmlFor="event-booking-type">Booking type</GlassLabel>
              <GlassSelect id="event-booking-type" value={form.booking_type} onChange={(e) => setField('booking_type', e.target.value)}>
                <option value="one_on_one">One-to-one</option>
                <option value="group">Group</option>
              </GlassSelect>
            </div>
            {form.booking_type === 'group' && (
              <div>
                <GlassLabel htmlFor="event-capacity">Maximum attendees</GlassLabel>
                <GlassInput id="event-capacity" type="number" min="2" value={form.max_attendees} onChange={(e) => setField('max_attendees', e.target.value)} />
              </div>
            )}
          </div>
          <div className="flex flex-wrap gap-5 text-sm font-semibold">
            <label className="flex items-center gap-2"><input type="checkbox" className="w-4 h-4" checked={form.active} onChange={(e) => setField('active', e.target.checked)} /> Active</label>
            <label className="flex items-center gap-2"><input type="checkbox" className="w-4 h-4" checked={form.requires_approval} onChange={(e) => setField('requires_approval', e.target.checked)} /> Requires approval</label>
          </div>
          <div className="flex justify-end gap-2 border-t border-border pt-4">
            <GlassButton type="button" variant="ghost" onClick={onClose}>Cancel</GlassButton>
            <GlassButton type="submit" variant="primary" disabled={saving}>{saving ? 'Saving...' : 'Save event'}</GlassButton>
          </div>
        </form>
      </DialogContent>
    </Dialog>
  );
}
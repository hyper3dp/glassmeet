import React, { useEffect, useState } from 'react';
import { useSearchParams, Link } from 'react-router-dom';
import { api } from '@/lib/localApi';
import { Plus, Clock, Edit3, Trash2, ExternalLink } from 'lucide-react';
import { GlassCard, GlassButton, GlassInput, GlassTextarea, GlassLabel, GlassSelect, EmptyState, Spinner } from '@/components/glass';

export default function EventTypes({ profile }) {
  const [eventTypes, setEventTypes] = useState([]);
  const [loading, setLoading] = useState(true);
  const [showModal, setShowModal] = useState(false);
  const [editing, setEditing] = useState(null);
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

  return (
    <div className="space-y-6 animate-fade-in">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl sm:text-3xl font-semibold tracking-tight">Event Types</h1>
          <p className="text-muted-foreground text-sm mt-1">Create meeting types guests can book with you.</p>
        </div>
        <GlassButton variant="primary" onClick={openNew}><Plus className="w-4 h-4" /> New event</GlassButton>
      </div>

      {loading ? <div className="flex justify-center py-20"><Spinner /></div> : eventTypes.length === 0 ? (
        <GlassCard hover={false}>
          <EmptyState icon={Clock} title="No event types yet" description="Create your first event type — like a 30-minute meeting — to start accepting bookings." action={<GlassButton variant="primary" onClick={openNew}><Plus className="w-4 h-4" /> Create event</GlassButton>} />
        </GlassCard>
      ) : (
        <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-4">
          {eventTypes.map((e) => (
            <EventCard key={e.id} event={e} onEdit={() => openEdit(e)} onDelete={() => handleDelete(e.id)} />
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

function EventCard({ event, onEdit, onDelete }) {
  return (
    <GlassCard hover={false} className="flex flex-col gap-4">
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <h2 className="truncate font-semibold">{event.name}</h2>
          <p className="mt-1 line-clamp-2 text-sm text-muted-foreground">{event.description || 'No description'}</p>
        </div>
        <span className={`shrink-0 rounded-full px-2.5 py-1 text-xs ${event.active ? 'bg-emerald-500/10 text-emerald-600' : 'bg-muted text-muted-foreground'}`}>
          {event.active ? 'Active' : 'Paused'}
        </span>
      </div>
      <div className="flex items-center gap-2 text-sm text-muted-foreground">
        <Clock className="h-4 w-4" /> {event.duration || 30} min <span aria-hidden="true">·</span> {event.location || 'Online'}
      </div>
      <div className="mt-auto flex flex-wrap items-center gap-2 border-t border-border/60 pt-3">
        <GlassButton size="sm" onClick={onEdit}><Edit3 className="h-4 w-4" /> Edit</GlassButton>
        <GlassButton size="sm" variant="danger" onClick={onDelete}><Trash2 className="h-4 w-4" /> Delete</GlassButton>
        <Link className="ml-auto inline-flex items-center gap-1 text-sm accent-text" to={`/book/${event.id}`}>
          Booking page <ExternalLink className="h-3.5 w-3.5" />
        </Link>
      </div>
    </GlassCard>
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
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4" onMouseDown={onClose}>
      <div className="glass-panel w-full max-w-xl p-6" onMouseDown={(eventObject) => eventObject.stopPropagation()}>
        <div className="mb-5 flex items-center justify-between">
          <h2 className="text-lg font-semibold">{event ? 'Edit event type' : 'New event type'}</h2>
          <button type="button" aria-label="Close" onClick={onClose} className="rounded-lg p-2 hover:bg-foreground/5">×</button>
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
          <div className="flex flex-wrap gap-5 text-sm">
            <label className="flex items-center gap-2"><input type="checkbox" checked={form.active} onChange={(e) => setField('active', e.target.checked)} /> Active</label>
            <label className="flex items-center gap-2"><input type="checkbox" checked={form.requires_approval} onChange={(e) => setField('requires_approval', e.target.checked)} /> Requires approval</label>
          </div>
          <div className="flex justify-end gap-2 border-t border-border/60 pt-4">
            <GlassButton type="button" variant="ghost" onClick={onClose}>Cancel</GlassButton>
            <GlassButton type="submit" variant="primary" disabled={saving}>{saving ? 'Saving...' : 'Save event'}</GlassButton>
          </div>
        </form>
      </div>
    </div>
  );
}
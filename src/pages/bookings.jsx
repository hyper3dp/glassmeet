import React, { useEffect, useState, useMemo } from 'react';
import { api } from '@/lib/localApi';
import {
  BookOpen, Calendar, Clock, MessageCircle, Copy, Check, X, Trash2, Mail, Phone, ChevronRight,
} from 'lucide-react';
import { GlassButton, GlassInput, GlassTextarea, GlassLabel, EmptyState, Spinner, PageHeader, Tabs, SaveStatus } from '@/components/glass';
import { useAutosave } from '@/lib/useAutosave';
import {
  formatMeetingDate, formatMeetingTime, buildWhatsAppLink, fillTemplate, buildBookingContext,
} from '@/lib/whatsapp';
import { detectTimezone } from '@/lib/Availability.js';
import { Dialog, DialogContent, DialogTitle } from '@/components/ui/dialog';

export default function Bookings({ profile, whatsapp }) {
  const [bookings, setBookings] = useState([]);
  const [loading, setLoading] = useState(true);
  const [filter, setFilter] = useState('upcoming');
  const [selected, setSelected] = useState(null);
  const timezone = profile?.timezone || detectTimezone();

  useEffect(() => { load(); }, []);

  const load = async () => {
    try {
      const b = await api.entities.Booking.filter({ host_id: profile.id }, '-start_time', 100);
      setBookings(b);
    } catch (e) {}
    setLoading(false);
  };

  const now = new Date();
  const filtered = useMemo(() => {
    let list = bookings;
    if (filter === 'upcoming') list = bookings.filter((b) => b.status === 'confirmed' && new Date(b.start_time) >= now).sort((a,b)=> new Date(a.start_time)-new Date(b.start_time));
    if (filter === 'past') list = bookings.filter((b) => new Date(b.start_time) < now).sort((a,b)=> new Date(b.start_time)-new Date(a.start_time));
    if (filter === 'pending') list = bookings.filter((b) => b.approval_status === 'pending' && b.status !== 'cancelled').sort((a,b)=> new Date(a.start_time)-new Date(b.start_time));
    if (filter === 'cancelled') list = bookings.filter((b) => b.status === 'cancelled');
    return list;
  }, [bookings, filter]);

  const cancel = async (id) => {
    if (!confirm('Cancel this meeting? The guest will need to be notified.')) return;
    await api.entities.Booking.update(id, { status: 'cancelled' });
    load();
  };

  if (loading) return <div className="flex justify-center py-24"><Spinner /></div>;

  const counts = {
    upcoming: bookings.filter((b) => b.status === 'confirmed' && new Date(b.start_time) >= now).length,
    pending: bookings.filter((b) => b.approval_status === 'pending' && b.status !== 'cancelled').length,
  };
  const groups = [];
  filtered.forEach((b) => {
    const day = new Date(b.start_time).toLocaleDateString('en-US', { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric', timeZone: timezone });
    const last = groups[groups.length - 1];
    if (last && last[0] === day) last[1].push(b); else groups.push([day, [b]]);
  });

  return (
    <div className="animate-fade-in">
      <PageHeader title="Meetings">
        <Tabs
          value={filter}
          onChange={setFilter}
          tabs={[
            { value: 'upcoming', label: 'Upcoming', count: counts.upcoming || null },
            { value: 'pending', label: 'Pending', count: counts.pending || null },
            { value: 'past', label: 'Past' },
            { value: 'cancelled', label: 'Canceled' },
          ]}
        />
      </PageHeader>

      <div className="rounded-xl border border-border bg-card shadow-card overflow-hidden">
        <div className="flex items-center justify-between border-b border-border px-5 py-3.5 text-sm text-muted-foreground">
          <span>Displaying {filtered.length} {filtered.length === 1 ? 'event' : 'events'}</span>
          <span className="hidden sm:inline">{timezone}</span>
        </div>
        {filtered.length === 0 ? (
          <EmptyState
            icon={BookOpen}
            title={filter === 'upcoming' ? 'No upcoming meetings' : filter === 'pending' ? 'Nothing waiting for approval' : filter === 'past' ? 'No past meetings' : 'No canceled meetings'}
            description={filter === 'upcoming' ? 'Share your booking link and new meetings show up here.' : undefined}
          />
        ) : groups.map(([day, items]) => (
          <div key={day}>
            <div className="bg-secondary px-5 py-2.5 text-sm font-bold border-b border-border">{day}</div>
            {items.map((b) => (
              <BookingCard key={b.id} booking={b} timezone={timezone} whatsapp={whatsapp} onView={()=>setSelected(b)} onCancel={()=>cancel(b.id)} />
            ))}
          </div>
        ))}
      </div>

      {selected && (
        <BookingDetail booking={selected} timezone={timezone} whatsapp={whatsapp} profile={profile} onClose={()=>setSelected(null)} onCancel={()=>{ cancel(selected.id); setSelected(null); }} onChanged={load} />
      )}
    </div>
  );
}

function BookingCard({ booking, timezone, whatsapp, onView, onCancel }) {
  const date = formatMeetingDate(booking.start_time, timezone);
  const time = formatMeetingTime(booking.start_time, timezone);
  const end = booking.end_time ? formatMeetingTime(booking.end_time, timezone) : null;
  const cancelled = booking.status === 'cancelled';
  const pending = booking.approval_status === 'pending' && !cancelled;

  const sendWhatsApp = () => {
    const ctx = { guestName: booking.guest_name, hostName: '', date, time, duration: '', meetingUrl: booking.meeting_url || '', timezone };
    const tmpl = whatsapp?.confirmation_template || `Hi [Name]! Your meeting is confirmed for [Date] at [Time]. Meeting: [Meeting Link]`;
    const msg = fillTemplate(tmpl, ctx);
    window.open(buildWhatsAppLink(booking.guest_phone, msg), '_blank');
  };

  return (
    <div className="flex flex-col gap-3 border-b border-border last:border-b-0 px-5 py-4 sm:flex-row sm:items-center sm:gap-5">
      <div className="flex items-center gap-4 sm:w-48 sm:shrink-0">
        <span className={`w-3.5 h-3.5 rounded-full shrink-0 ${cancelled ? 'bg-border-hover' : 'bg-primary'}`} />
        <span className={`text-sm tabular ${cancelled ? 'text-muted-foreground line-through' : 'text-foreground'}`}>{time}{end && ` – ${end}`}</span>
      </div>
      <div className="min-w-0 flex-1 pl-[30px] sm:pl-0">
        <div className="flex items-center gap-2">
          <span className="truncate text-[15px] font-bold">{booking.guest_name}</span>
          {pending && <span className="shrink-0 rounded-full bg-warning/15 px-2 py-0.5 text-xs font-semibold text-warning">Pending</span>}
          {cancelled && <span className="shrink-0 rounded-full bg-destructive/10 px-2 py-0.5 text-xs font-semibold text-destructive">Canceled</span>}
        </div>
        <div className="truncate text-sm text-muted-foreground">Event type <span className="font-semibold text-foreground">{booking.event_name || 'Meeting'}</span></div>
      </div>
      <div className="flex items-center gap-1 pl-[30px] sm:pl-0">
        {!cancelled && <GlassButton size="sm" variant="ghost" type="button" onClick={sendWhatsApp}><MessageCircle className="w-4 h-4" /> WhatsApp</GlassButton>}
        {!cancelled && <GlassButton size="sm" variant="ghost" type="button" onClick={onCancel} className="text-destructive hover:text-destructive"><X className="w-4 h-4" /> Cancel</GlassButton>}
        <button type="button" onClick={onView} className="h-8 px-2 text-sm font-semibold text-muted-foreground flex items-center gap-1 hover:text-foreground">
          Details <ChevronRight className="w-4 h-4" />
        </button>
      </div>
    </div>
  );
}

function BookingDetail({ booking, timezone, whatsapp, profile, onClose, onCancel, onChanged }) {
  const [notes, setNotes] = useState(booking.notes || '');
  const [copied, setCopied] = useState(false);
  const [meetingUrl, setMeetingUrl] = useState(booking.meeting_url || '');

  const ctx = buildBookingContext(booking, { duration: 30 }, profile, timezone);
  const tmpl = whatsapp?.confirmation_template || `Hi [Name]! Your meeting with [Host] is confirmed.\n\nDate: [Date]\nTime: [Time]\nDuration: [Duration]\nMeeting: [Meeting Link]\n\nSee you then!`;
  const waMsg = fillTemplate(tmpl, ctx);

  const copyLink = () => { navigator.clipboard.writeText(meetingUrl || booking.meeting_url || ''); setCopied(true); setTimeout(()=>setCopied(false),2000); };

  const saveState = useAutosave({ notes, meeting_url: meetingUrl }, (value) => api.entities.Booking.update(booking.id, value));
  const close = () => { if (saveState !== 'idle') onChanged(); onClose(); };

  return (
    <Dialog open onOpenChange={(next) => { if (!next) close(); }}>
      <DialogContent showCloseButton={false} aria-describedby={undefined} className="sm:max-w-lg p-6 block">
        <div className="flex items-center justify-between mb-5">
          <DialogTitle>Meeting details</DialogTitle>
          <div className="ml-auto mr-2"><SaveStatus state={saveState} /></div>
          <button onClick={close} aria-label="Close" className="w-8 h-8 rounded-full flex items-center justify-center text-muted-foreground hover:bg-secondary"><X className="w-4 h-4" /></button>
        </div>

        <div className="space-y-4">
          <div className="rounded-lg border border-border p-4 space-y-1.5">
            <div className="font-bold text-lg">{booking.event_name}</div>
            <div className="flex items-center gap-2 text-sm text-muted-foreground"><Calendar className="w-4 h-4" /> {formatMeetingDate(booking.start_time, timezone)}</div>
            <div className="flex items-center gap-2 text-sm text-muted-foreground"><Clock className="w-4 h-4" /> {formatMeetingTime(booking.start_time, timezone)} ({timezone})</div>
          </div>

          <div className="grid grid-cols-2 gap-3 text-sm">
            <InfoRow icon={Mail} label="Email" value={booking.guest_email || 'Not given'} />
            <InfoRow icon={Phone} label="WhatsApp" value={booking.guest_phone} />
          </div>
          {booking.guest_notes && (
            <div>
              <GlassLabel>Guest notes</GlassLabel>
              <div className="rounded-lg bg-secondary p-3 text-sm text-foreground">{booking.guest_notes}</div>
            </div>
          )}

          <div>
            <GlassLabel>Meeting URL</GlassLabel>
            <div className="flex gap-2">
              <GlassInput value={meetingUrl} onChange={(e)=>setMeetingUrl(e.target.value)} placeholder="https://..." />
              <GlassButton onClick={copyLink}>{copied ? <Check className="w-4 h-4 text-success" /> : <Copy className="w-4 h-4" />}</GlassButton>
            </div>
          </div>

          <div>
            <GlassLabel>Host notes (saved automatically)</GlassLabel>
            <GlassTextarea rows={3} value={notes} onChange={(e)=>setNotes(e.target.value)} placeholder="Private notes about this meeting..." />
          </div>

          <div className="rounded-lg bg-secondary p-4">
            <div className="text-xs font-semibold text-muted-foreground mb-1.5 flex items-center gap-1.5"><MessageCircle className="w-3.5 h-3.5" /> WhatsApp message</div>
            <pre className="text-sm whitespace-pre-wrap font-body text-foreground">{waMsg}</pre>
          </div>
        </div>

        <div className="flex flex-col sm:flex-row gap-2 mt-6">
          <GlassButton variant="primary" className="flex-1" onClick={()=>window.open(buildWhatsAppLink(booking.guest_phone, waMsg), '_blank')}><MessageCircle className="w-4 h-4" /> Send on WhatsApp</GlassButton>
          {booking.status !== 'cancelled' && <GlassButton variant="danger" onClick={onCancel}><Trash2 className="w-4 h-4" /> Cancel</GlassButton>}
        </div>
      </DialogContent>
    </Dialog>
  );
}

function InfoRow({ icon: Icon, label, value }) {
  return (
    <div className="rounded-lg border border-border p-3">
      <div className="text-xs font-semibold text-muted-foreground flex items-center gap-1.5 mb-0.5"><Icon className="w-3 h-3" /> {label}</div>
      <div className="font-semibold truncate">{value}</div>
    </div>
  );
}
import React, { useEffect, useRef, useState, useMemo } from 'react';
import { useSearchParams } from 'react-router-dom';
import { toast } from 'sonner';
import { api } from '@/lib/localApi';
import {
  BookOpen, Calendar, Clock, MessageCircle, Copy, Check, X, Trash2, Mail, Phone, ChevronRight, CheckCircle2, Search, Video,
} from 'lucide-react';
import { GlassButton, GlassInput, GlassTextarea, GlassLabel, EmptyState, Spinner, PageHeader, Tabs, SaveStatus } from '@/components/glass';
import { useAutosave } from '@/lib/useAutosave';
import {
  formatMeetingDate, formatMeetingTime, buildWhatsAppLink, fillTemplate, buildBookingContext, DEFAULT_CONFIRMATION_TEMPLATE,
  DEFAULT_REMINDER_24H, DEFAULT_REMINDER_1H, DEFAULT_CANCELLATION_TEMPLATE, DEFAULT_DECLINE_TEMPLATE,
} from '@/lib/whatsapp';
import { detectTimezone } from '@/lib/Availability.js';
import { withoutExpiredCancellations } from '@/lib/bookings';
import { appPath } from '@/lib/authReturnTo';
import { Dialog, DialogContent, DialogTitle } from '@/components/ui/dialog';

const TABS = ['upcoming', 'pending', 'past', 'cancelled'];
// the messages a host can send from a meeting; the default follows what just happened
const MESSAGE_KINDS = [
  { value: 'confirmation', label: 'Confirmation' },
  { value: 'reminder', label: 'Reminder (day before)' },
  { value: 'reminder_1h', label: 'Reminder (hour before)' },
  { value: 'cancellation', label: 'Cancellation' },
  { value: 'decline', label: 'Decline' },
];
const defaultKind = (b) => (b.approval_status === 'declined' ? 'decline' : b.status === 'cancelled' ? 'cancellation' : 'confirmation');

export default function Bookings({ profile, whatsapp }) {
  const [params, setParams] = useSearchParams();
  const [bookings, setBookings] = useState([]);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState('');
  const filter = TABS.includes(params.get('tab')) ? params.get('tab') : 'upcoming';
  const query = params.get('q') || '';
  const [selected, setSelected] = useState(null);
  const [confirming, setConfirming] = useState(null); // { kind: 'cancel' | 'decline', booking }
  const timezone = profile?.timezone || detectTimezone();

  const setParam = (key, value) => setParams((p) => { const next = new URLSearchParams(p); if (value) next.set(key, value); else next.delete(key); return next; }, { replace: true });

  useEffect(() => { load(); }, []);

  const load = async () => {
    setLoadError('');
    try {
      const b = await api.entities.Booking.filter({ host_id: profile.id }, '-start_time', 1000);
      setBookings(withoutExpiredCancellations(b));
    } catch (e) {
      setLoadError(e?.message || 'Your meetings could not be loaded.');
    }
    setLoading(false);
  };

  // notifications and the dashboard link straight to a meeting with ?id=. A meeting booked after
  // this page loaded (a notification clicked while already here) isn't in the list yet: reload
  // once before saying it's gone.
  const refetchedFor = useRef(null);
  useEffect(() => {
    const id = params.get('id');
    if (!id || loading) return;
    const b = bookings.find((x) => x.id === id);
    if (!b && refetchedFor.current !== id) { refetchedFor.current = id; load(); return; }
    refetchedFor.current = null;
    if (b) setSelected({ booking: b, kind: defaultKind(b) });
    else toast('That meeting is no longer listed.');
    setParam('id', '');
  }, [params, loading, bookings, loadError]);

  const now = new Date();
  // a meeting stays upcoming until it ends, so one in progress is still listed
  const isUpcoming = (b) => b.status === 'confirmed' && new Date(b.end_time || b.start_time) >= now;
  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    // searching looks through every tab
    if (q) {
      const digits = q.replace(/\D/g, '');
      return bookings.filter((b) => [b.guest_name, b.guest_email, b.event_name].some((v) => v?.toLowerCase().includes(q))
        || (digits.length >= 3 && (b.guest_phone || '').replace(/\D/g, '').includes(digits)));
    }
    let list = bookings;
    if (filter === 'upcoming') list = bookings.filter(isUpcoming).sort((a,b)=> new Date(a.start_time)-new Date(b.start_time));
    if (filter === 'past') list = bookings.filter((b) => !isUpcoming(b) && b.status !== 'cancelled').sort((a,b)=> new Date(b.start_time)-new Date(a.start_time));
    if (filter === 'pending') list = bookings.filter((b) => b.approval_status === 'pending' && b.status !== 'cancelled').sort((a,b)=> new Date(a.start_time)-new Date(b.start_time));
    if (filter === 'cancelled') list = bookings.filter((b) => b.status === 'cancelled');
    return list;
  }, [bookings, filter, query]);

  // after a change the guest usually needs to hear about it, so the meeting opens with that message
  // one change per meeting at a time, so a double tap doesn't send it twice
  const changing = useRef(new Set());
  const change = async (b, fields, failMessage, thenMessage) => {
    if (changing.current.has(b.id)) return;
    changing.current.add(b.id);
    try {
      const saved = await api.entities.Booking.update(b.id, fields);
      // nothing updated: the meeting was deleted, or isn't this host's to change
      if (!saved) throw new Error('It may have been deleted. Reload the page.');
      const updated = { ...b, ...fields };
      // approved, cancelled or declined: the host's Google Calendar follows (if connected)
      if ('approval_status' in fields || 'status' in fields) api.google.pushBooking(b.id);
      setBookings((list) => list.map((x) => (x.id === b.id ? updated : x)));
      if (thenMessage) setSelected({ booking: updated, kind: thenMessage, justChanged: true });
      else setSelected((cur) => (cur?.booking.id === b.id ? { ...cur, booking: updated } : cur));
    } catch (e) {
      toast.error(`${failMessage} ${e.message || ''}`.trim());
    } finally {
      changing.current.delete(b.id);
    }
  };
  const approve = (b) => change(b, { approval_status: 'approved' }, 'Could not approve this request.', 'confirmation');
  const askCancel = (b) => setConfirming({ kind: 'cancel', booking: b });
  // a declined request frees its time again
  const askDecline = (b) => setConfirming({ kind: 'decline', booking: b });
  const confirmChange = () => {
    const { kind, booking } = confirming;
    setConfirming(null);
    if (kind === 'cancel') change(booking, { status: 'cancelled' }, 'Could not cancel this meeting.', 'cancellation');
    else change(booking, { approval_status: 'declined', status: 'cancelled' }, 'Could not decline this request.', 'decline');
  };

  // the WhatsApp message to the guest, from the host's templates
  const messageFor = (b, kind = defaultKind(b)) => {
    const minutes = b.end_time ? Math.round((new Date(b.end_time) - new Date(b.start_time)) / 60000) : 30;
    const bookingLink = b.event_type_id ? `${window.location.origin}${appPath(`/book/${b.event_type_id}`)}` : '';
    const ctx = buildBookingContext(b, { duration: minutes, bookingLink }, profile, timezone);
    const template = {
      confirmation: whatsapp?.confirmation_template || DEFAULT_CONFIRMATION_TEMPLATE,
      reminder: whatsapp?.reminder_24h_template || DEFAULT_REMINDER_24H,
      reminder_1h: whatsapp?.reminder_1h_template || DEFAULT_REMINDER_1H,
      cancellation: DEFAULT_CANCELLATION_TEMPLATE,
      decline: DEFAULT_DECLINE_TEMPLATE,
    }[kind];
    return fillTemplate(template, ctx);
  };

  const counts = useMemo(() => ({
    upcoming: bookings.filter(isUpcoming).length,
    pending: bookings.filter((b) => b.approval_status === 'pending' && b.status !== 'cancelled').length,
  }), [bookings]);
  // one formatter for the whole list: a new one per meeting is slow with hundreds of them
  const groups = useMemo(() => {
    const dayFormat = new Intl.DateTimeFormat('en-US', { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric', timeZone: timezone });
    const list = [];
    filtered.forEach((b) => {
      const day = dayFormat.format(new Date(b.start_time));
      const last = list[list.length - 1];
      if (last && last[0] === day) last[1].push(b); else list.push([day, [b]]);
    });
    return list;
  }, [filtered, timezone]);

  if (loading) return <div className="flex justify-center py-24"><Spinner /></div>;

  return (
    <div className="animate-fade-in">
      <PageHeader title="Meetings">
        <Tabs
          value={query ? '' : filter}
          onChange={(tab) => setParams((p) => {
            // one update: two in a row would each start from this render's params
            const next = new URLSearchParams(p);
            next.delete('q');
            if (tab === 'upcoming') next.delete('tab'); else next.set('tab', tab);
            return next;
          }, { replace: true })}
          tabs={[
            { value: 'upcoming', label: 'Upcoming', count: counts.upcoming || null },
            { value: 'pending', label: 'Pending', count: counts.pending || null },
            { value: 'past', label: 'Past' },
            { value: 'cancelled', label: 'Canceled' },
          ]}
        />
      </PageHeader>

      <div className="rounded-xl border border-border bg-card shadow-card overflow-hidden">
        <div className="flex flex-wrap items-center justify-between gap-3 border-b border-border px-5 py-3.5 text-sm text-muted-foreground">
          <label className="relative w-full sm:w-72">
            <span className="sr-only">Search meetings</span>
            <Search className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-hint" />
            <GlassInput type="search" value={query} onChange={(e) => setParam('q', e.target.value)} placeholder="Search by name, phone or email" className="pl-9 h-10" />
          </label>
          <span>
            {query ? `${filtered.length} ${filtered.length === 1 ? 'match' : 'matches'}` : `Displaying ${filtered.length} ${filtered.length === 1 ? 'event' : 'events'}`}
            {!query && filter === 'cancelled' && '. Canceled meetings disappear 2 days after they’re canceled.'}
            <span className="hidden sm:inline"> · {timezone}</span>
          </span>
        </div>
        {loadError ? (
          <div className="px-5 py-12 text-center">
            <p className="text-sm text-destructive">Your meetings couldn't be loaded. {loadError}</p>
            <GlassButton type="button" className="mt-4" onClick={() => { setLoading(true); load(); }}>Try again</GlassButton>
          </div>
        ) : filtered.length === 0 ? (
          <EmptyState
            icon={BookOpen}
            title={query ? 'No meetings match' : filter === 'upcoming' ? 'No upcoming meetings' : filter === 'pending' ? 'Nothing waiting for approval' : filter === 'past' ? 'No past meetings' : 'No canceled meetings'}
            description={query ? 'Try a guest’s first name or the last digits of their number.' : filter === 'upcoming' ? 'Share your booking link and new meetings show up here.' : undefined}
          />
        ) : groups.map(([day, items]) => (
          <div key={day}>
            <div className="bg-secondary px-5 py-2.5 text-sm font-bold border-b border-border">{day}</div>
            {items.map((b) => (
              <BookingCard key={b.id} booking={b} timezone={timezone} getMessage={() => messageFor(b)} onView={()=>setSelected({ booking: b, kind: defaultKind(b) })} onCancel={()=>askCancel(b)} onApprove={()=>approve(b)} onDecline={()=>askDecline(b)} />
            ))}
          </div>
        ))}
      </div>

      {selected && (
        <BookingDetail key={selected.booking.id} booking={selected.booking} initialKind={selected.kind} justChanged={selected.justChanged} timezone={timezone} messageFor={messageFor}
          onClose={()=>setSelected(null)} onCancel={()=>askCancel(selected.booking)} onApprove={()=>approve(selected.booking)} onDecline={()=>askDecline(selected.booking)}
          onChanged={(fields) => setBookings((list) => list.map((x) => (x.id === selected.booking.id ? { ...x, ...fields } : x)))} />
      )}

      {confirming && (
        <Dialog open onOpenChange={(next) => { if (!next) setConfirming(null); }}>
          <DialogContent showCloseButton={false} className="sm:max-w-sm p-6 block">
            <DialogTitle>{confirming.kind === 'cancel' ? 'Cancel this meeting?' : 'Decline this request?'}</DialogTitle>
            <p className="mt-2 text-sm text-muted-foreground">
              {confirming.booking.guest_name}, {formatMeetingDate(confirming.booking.start_time, timezone)} at {formatMeetingTime(confirming.booking.start_time, timezone)}. The time opens up again, and you can message {confirming.booking.guest_name?.split(' ')[0] || 'the guest'} next.
            </p>
            <div className="mt-6 flex justify-end gap-2">
              <GlassButton type="button" variant="ghost" onClick={() => setConfirming(null)}>Keep it</GlassButton>
              <GlassButton type="button" variant="danger" onClick={confirmChange}>{confirming.kind === 'cancel' ? 'Cancel meeting' : 'Decline'}</GlassButton>
            </div>
          </DialogContent>
        </Dialog>
      )}
    </div>
  );
}

function BookingCard({ booking, timezone, getMessage, onView, onCancel, onApprove, onDecline }) {
  const time = formatMeetingTime(booking.start_time, timezone);
  const end = booking.end_time ? formatMeetingTime(booking.end_time, timezone) : null;
  const cancelled = booking.status === 'cancelled';
  const pending = booking.approval_status === 'pending' && !cancelled;
  const declined = booking.approval_status === 'declined';

  // the message is only filled in when it's sent, not for every meeting on every render
  const sendWhatsApp = () => window.open(buildWhatsAppLink(booking.guest_phone, getMessage()), '_blank');

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
          {cancelled && <span className="shrink-0 rounded-full bg-destructive/10 px-2 py-0.5 text-xs font-semibold text-destructive">{declined ? 'Declined' : 'Canceled'}</span>}
        </div>
        <div className="truncate text-sm text-muted-foreground">Event type <span className="font-semibold text-foreground">{booking.event_name || 'Meeting'}</span></div>
      </div>
      <div className="flex flex-wrap items-center gap-1 pl-[30px] sm:pl-0">
        {pending ? (
          <>
            <GlassButton size="sm" variant="primary" type="button" onClick={onApprove}><CheckCircle2 className="w-4 h-4" /> Approve</GlassButton>
            <GlassButton size="sm" variant="ghost" type="button" onClick={onDecline} className="text-destructive hover:text-destructive"><X className="w-4 h-4" /> Decline</GlassButton>
          </>
        ) : !cancelled && (
          <>
            {booking.guest_phone && <GlassButton size="sm" variant="ghost" type="button" onClick={sendWhatsApp}><MessageCircle className="w-4 h-4" /> WhatsApp</GlassButton>}
            <GlassButton size="sm" variant="ghost" type="button" onClick={onCancel} className="text-destructive hover:text-destructive"><X className="w-4 h-4" /> Cancel</GlassButton>
          </>
        )}
        <button type="button" onClick={onView} className="h-10 px-2 text-sm font-semibold text-muted-foreground flex items-center gap-1 hover:text-foreground">
          Details <ChevronRight className="w-4 h-4" />
        </button>
      </div>
    </div>
  );
}

function BookingDetail({ booking, initialKind, justChanged, timezone, messageFor, onClose, onCancel, onApprove, onDecline, onChanged }) {
  const [notes, setNotes] = useState(booking.notes || '');
  const [copied, setCopied] = useState(false);
  const [meetingUrl, setMeetingUrl] = useState(booking.meeting_url || '');
  const [kind, setKind] = useState(initialKind || defaultKind(booking));
  // cancelling or declining from this dialog keeps it open: switch to the matching message
  useEffect(() => { setKind(initialKind || defaultKind(booking)); }, [initialKind, booking.status, booking.approval_status]);
  const cancelled = booking.status === 'cancelled';
  const pending = booking.approval_status === 'pending' && !cancelled;
  const message = messageFor({ ...booking, meeting_url: meetingUrl || booking.meeting_url }, kind);
  const [draft, setDraft] = useState(null); // the host's own edits to the message
  useEffect(() => { setDraft(null); }, [kind]);
  const waMsg = draft ?? message;

  const copyLink = async () => {
    try { await navigator.clipboard.writeText(meetingUrl || booking.meeting_url || ''); setCopied(true); setTimeout(()=>setCopied(false),2000); }
    catch { toast.error('Could not copy the link.'); }
  };

  const copyMessage = async () => {
    try { await navigator.clipboard.writeText(waMsg); toast.success('Message copied'); }
    catch { toast.error('Could not copy the message.'); }
  };

  // the link is part of the Google Calendar copy (notes aren't), so a changed link updates it
  const pushedUrl = useRef(booking.meeting_url || '');
  const autosave = useAutosave({ notes, meeting_url: meetingUrl }, async (value) => {
    const saved = await api.entities.Booking.update(booking.id, value);
    if (value.meeting_url !== pushedUrl.current) {
      pushedUrl.current = value.meeting_url;
      api.google.pushBooking(booking.id);
    }
    return saved;
  });
  // the list takes the edits straight away: a reload here would run before the last save does
  const close = () => { if (autosave.state !== 'idle') onChanged({ notes, meeting_url: meetingUrl }); onClose(); };
  const link = meetingUrl || booking.meeting_url;

  return (
    <Dialog open onOpenChange={(next) => { if (!next) close(); }}>
      <DialogContent showCloseButton={false} aria-describedby={undefined} className="sm:max-w-lg p-6 block max-h-[92vh] overflow-y-auto">
        <div className="flex items-center justify-between mb-5">
          <DialogTitle>Meeting details</DialogTitle>
          <div className="ml-auto mr-2"><SaveStatus state={autosave.state} error={autosave.error} onRetry={autosave.retry} /></div>
          <button onClick={close} aria-label="Close" className="w-8 h-8 rounded-full flex items-center justify-center text-muted-foreground hover:bg-secondary"><X className="w-4 h-4" /></button>
        </div>

        {justChanged && (
          <p role="status" className="mb-4 rounded-lg bg-primary-soft px-3.5 py-2.5 text-sm text-link">
            {kind === 'confirmation' ? 'Approved.' : kind === 'decline' ? 'Request declined.' : 'Meeting canceled.'} Let {booking.guest_name?.split(' ')[0] || 'the guest'} know below.
          </p>
        )}

        <div className="space-y-4">
          <div className="rounded-lg border border-border p-4 space-y-1.5">
            <div className="font-bold text-lg">{booking.event_name}</div>
            <div className="flex items-center gap-2 text-sm text-muted-foreground"><Calendar className="w-4 h-4" /> {formatMeetingDate(booking.start_time, timezone)}</div>
            <div className="flex items-center gap-2 text-sm text-muted-foreground"><Clock className="w-4 h-4" /> {formatMeetingTime(booking.start_time, timezone)}{booking.end_time && ` – ${formatMeetingTime(booking.end_time, timezone)}`} ({timezone})</div>
            {link && !cancelled && (
              <a href={link} target="_blank" rel="noreferrer" className="mt-2 inline-flex h-10 items-center gap-2 rounded-full bg-primary px-4 text-sm font-semibold text-primary-foreground transition-all duration-200 hover:opacity-90"><Video className="w-4 h-4" /> Join meeting</a>
            )}
          </div>

          <div className="grid grid-cols-2 gap-3 text-sm">
            <InfoRow icon={Mail} label="Email" value={booking.guest_email || 'Not given'} href={booking.guest_email && `mailto:${booking.guest_email}`} />
            <InfoRow icon={Phone} label="WhatsApp" value={booking.guest_phone || 'Not given'} href={booking.guest_phone && `tel:${booking.guest_phone}`} />
          </div>
          {booking.guest_notes && (
            <div>
              <div className="mb-1.5 text-sm font-semibold">Guest notes</div>
              <div className="rounded-lg bg-secondary p-3 text-sm text-foreground">{booking.guest_notes}</div>
            </div>
          )}

          <div>
            <GlassLabel htmlFor="bd-url">Meeting URL</GlassLabel>
            <div className="flex gap-2">
              <GlassInput id="bd-url" value={meetingUrl} onChange={(e)=>setMeetingUrl(e.target.value)} placeholder="https://..." />
              <GlassButton type="button" onClick={copyLink} aria-label="Copy meeting link">{copied ? <Check className="w-4 h-4 text-success" /> : <Copy className="w-4 h-4" />}</GlassButton>
            </div>
          </div>

          <div>
            <GlassLabel htmlFor="bd-notes">Host notes (saved automatically)</GlassLabel>
            <GlassTextarea id="bd-notes" rows={3} value={notes} onChange={(e)=>setNotes(e.target.value)} placeholder="Private notes about this meeting..." />
          </div>

          {/* without a number the message can still be copied or emailed */}
          <div className="rounded-lg bg-secondary p-4 space-y-3">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <label htmlFor="bd-msg" className="text-sm font-semibold flex items-center gap-1.5"><MessageCircle className="w-4 h-4" /> {booking.guest_phone ? 'WhatsApp message' : 'Message'}</label>
              <select aria-label="Message type" value={kind} onChange={(e) => setKind(e.target.value)} className="h-8 rounded-full border border-input bg-field px-3 text-sm font-semibold">
                {MESSAGE_KINDS.map((k) => <option key={k.value} value={k.value}>{k.label}</option>)}
              </select>
            </div>
            <GlassTextarea id="bd-msg" rows={6} value={waMsg} onChange={(e) => setDraft(e.target.value)} />
            {!booking.guest_phone && (
              <div className="flex flex-wrap gap-2">
                <GlassButton type="button" size="sm" onClick={copyMessage}><Copy className="w-4 h-4" /> Copy message</GlassButton>
                {booking.guest_email && (
                  <a href={`mailto:${booking.guest_email}?subject=${encodeURIComponent(booking.event_name || 'Our meeting')}&body=${encodeURIComponent(waMsg)}`}
                    className="inline-flex h-9 items-center gap-2 rounded-full border border-border px-4 text-sm font-semibold transition-all duration-200 hover:border-border-hover hover:bg-card"><Mail className="w-4 h-4" /> Email</a>
                )}
              </div>
            )}
          </div>
        </div>

        <div className="flex flex-col sm:flex-row gap-2 mt-6">
          {pending ? (
            <>
              <GlassButton type="button" variant="primary" className="sm:flex-1" onClick={onApprove}><CheckCircle2 className="w-4 h-4" /> Approve request</GlassButton>
              <GlassButton type="button" variant="danger" onClick={onDecline}><X className="w-4 h-4" /> Decline</GlassButton>
            </>
          ) : (
            <>
              {booking.guest_phone && <GlassButton type="button" variant="primary" className="sm:flex-1" onClick={()=>window.open(buildWhatsAppLink(booking.guest_phone, waMsg), '_blank')}><MessageCircle className="w-4 h-4" /> Send on WhatsApp</GlassButton>}
              {!cancelled && <GlassButton type="button" variant="danger" onClick={onCancel}><Trash2 className="w-4 h-4" /> Cancel</GlassButton>}
            </>
          )}
        </div>
      </DialogContent>
    </Dialog>
  );
}

function InfoRow({ icon: Icon, label, value, href }) {
  return (
    <div className="rounded-lg border border-border p-3">
      <div className="text-xs font-semibold text-muted-foreground flex items-center gap-1.5 mb-0.5"><Icon className="w-3 h-3" /> {label}</div>
      {href ? <a href={href} className="block font-semibold truncate text-link hover:underline">{value}</a> : <div className="font-semibold truncate">{value}</div>}
    </div>
  );
}

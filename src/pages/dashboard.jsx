import React, { useEffect, useState, useMemo } from 'react';
import { Link } from 'react-router-dom';
import { api } from '@/lib/localApi';
import { Calendar, Plus, MessageCircle, CheckCircle2, Link2 } from 'lucide-react';
import { GlassButton, EmptyState, Spinner, PageHeader, Avatar } from '@/components/glass';
import EventCard from '@/components/eventcard.jsx';
import { formatMeetingDate, formatMeetingTime, buildWhatsAppShareLink } from '@/lib/whatsapp';
import { detectTimezone } from '@/lib/Availability.js';
import { appPath } from '@/lib/authReturnTo';

export default function Dashboard({ profile }) {
  const [bookings, setBookings] = useState([]);
  const [eventTypes, setEventTypes] = useState([]);
  const [loading, setLoading] = useState(true);
  const [copied, setCopied] = useState(false);
  const timezone = profile?.timezone || detectTimezone();

  useEffect(() => {
    (async () => {
      try {
        const [b, e] = await Promise.all([
          api.entities.Booking.filter({ host_id: profile.id }, '-start_time', 50),
          api.entities.EventType.filter({ created_by_id: profile.id }, '-created_date', 20),
        ]);
        setBookings(b);
        setEventTypes(e);
      } catch (e) {}
      setLoading(false);
    })();
  }, [profile.id]);

  const now = new Date();
  const todayStr = now.toISOString().slice(0, 10);

  const upcoming = useMemo(
    () => bookings.filter((b) => b.status === 'confirmed' && new Date(b.start_time) >= now).sort((a,b)=> new Date(a.start_time)-new Date(b.start_time)),
    [bookings]
  );
  const todays = useMemo(
    () => upcoming.filter((b) => b.start_time.slice(0,10) === todayStr),
    [upcoming]
  );
  const recent = useMemo(() => bookings.slice(0, 5), [bookings]);

  const eventColor = (id) => eventTypes.find((e) => e.id === id)?.color;

  const firstEvent = eventTypes[0];
  const bookingLink = firstEvent ? `${window.location.origin}${appPath(`/book/${firstEvent.id}`)}` : '';

  const shareOnWhatsApp = () => {
    const msg = firstEvent
      ? `Book a time with me on GlassMeet: ${bookingLink}`
      : 'Check out GlassMeet — WhatsApp-first scheduling';
    window.open(buildWhatsAppShareLink(msg), '_blank');
  };

  const copyLink = () => {
    navigator.clipboard.writeText(bookingLink);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  if (loading) return <div className="flex justify-center py-24"><Spinner className="w-8 h-8" /></div>;

  const firstName = profile?.full_name?.split(' ')[0];
  const groups = groupByDay(upcoming.slice(0, 8), timezone);

  return (
    <div className="animate-fade-in">
      <PageHeader
        title={firstName ? `Welcome, ${firstName}` : 'Welcome'}
        description={todays.length ? `You have ${todays.length} meeting${todays.length === 1 ? '' : 's'} today.` : 'No meetings today.'}
        actions={
          <>
            <GlassButton type="button" onClick={shareOnWhatsApp}><MessageCircle className="w-4 h-4" /> Share on WhatsApp</GlassButton>
            <Link to="/event-types?new=true"><GlassButton variant="primary" type="button"><Plus className="w-4 h-4" strokeWidth={2.5} /> Create</GlassButton></Link>
          </>
        }
      />

      {/* Booking link */}
      {firstEvent && (
        <div className="mb-6 flex flex-col gap-3 rounded-xl border border-border bg-card px-5 py-4 shadow-card sm:flex-row sm:items-center">
          <div className="min-w-0 flex-1">
            <div className="text-sm font-bold">Your booking link</div>
            <a href={bookingLink} target="_blank" rel="noreferrer" className="block truncate text-sm text-link hover:underline">{bookingLink}</a>
          </div>
          <GlassButton variant="brand" size="sm" type="button" onClick={copyLink}>
            {copied ? <><CheckCircle2 className="w-4 h-4" /> Copied</> : <><Link2 className="w-4 h-4" /> Copy link</>}
          </GlassButton>
        </div>
      )}

      {/* Summary strip */}
      <dl className="mb-8 grid grid-cols-2 sm:grid-cols-4 gap-px overflow-hidden rounded-xl border border-border bg-border shadow-card">
        <Stat label="Today" value={todays.length} />
        <Stat label="Upcoming" value={upcoming.length} />
        <Stat label="All bookings" value={bookings.length} />
        <Stat label="Event types" value={eventTypes.length} />
      </dl>

      <div className="grid gap-8 lg:grid-cols-[1fr_340px]">
        {/* Upcoming meetings */}
        <section>
          <div className="mb-3 flex items-center justify-between">
            <h2 className="text-lg font-bold">Upcoming meetings</h2>
            <Link to="/bookings" className="text-sm font-semibold text-link hover:underline">View all</Link>
          </div>
          <div className="rounded-xl border border-border bg-card shadow-card overflow-hidden">
            {groups.length === 0 ? (
              <EmptyState icon={Calendar} title="No upcoming meetings" description="Share your booking link and new meetings show up here." />
            ) : groups.map(([day, items]) => (
              <div key={day}>
                <div className="bg-secondary px-5 py-2.5 text-sm font-bold border-b border-border">{day}</div>
                {items.map((b) => <BookingRow key={b.id} booking={b} timezone={timezone} color={eventColor(b.event_type_id)} />)}
              </div>
            ))}
          </div>
        </section>

        {/* Recent */}
        <section>
          <div className="mb-3 flex items-center justify-between">
            <h2 className="text-lg font-bold">Recently booked</h2>
          </div>
          <div className="rounded-xl border border-border bg-card shadow-card">
            {recent.length === 0 ? (
              <p className="px-5 py-10 text-center text-sm text-muted-foreground">New bookings appear here.</p>
            ) : (
              <ul className="divide-y divide-border">
                {recent.map((b) => (
                  <li key={b.id} className="flex items-center gap-3 px-5 py-3.5">
                    <Avatar name={b.guest_name} size={32} />
                    <div className="min-w-0 flex-1">
                      <div className="truncate text-sm font-bold">{b.guest_name}</div>
                      <div className="truncate text-xs text-muted-foreground">{b.event_name || 'Meeting'} · {formatMeetingDate(b.start_time, timezone)}</div>
                    </div>
                    {b.status === 'cancelled' && <span className="text-xs font-semibold text-destructive">Canceled</span>}
                  </li>
                ))}
              </ul>
            )}
          </div>
        </section>
      </div>

      {/* Event types */}
      <section className="mt-10">
        <div className="mb-3 flex items-center justify-between">
          <h2 className="text-lg font-bold">Event types</h2>
          <Link to="/event-types" className="text-sm font-semibold text-link hover:underline">View all</Link>
        </div>
        {eventTypes.length === 0 ? (
          <div className="rounded-xl border border-border bg-card shadow-card">
            <EmptyState icon={Plus} title="No event types" description="Create an event type to start taking bookings." action={<Link to="/event-types?new=true"><GlassButton variant="primary" size="sm" type="button"><Plus className="w-4 h-4" /> New event type</GlassButton></Link>} />
          </div>
        ) : (
          <div className="grid gap-5 sm:grid-cols-2 xl:grid-cols-3">
            {eventTypes.slice(0, 3).map((e) => <EventCard key={e.id} event={e} />)}
          </div>
        )}
      </section>
    </div>
  );
}

function groupByDay(list, timezone) {
  const map = new Map();
  list.forEach((b) => {
    const key = new Date(b.start_time).toLocaleDateString('en-US', { weekday: 'long', day: 'numeric', month: 'long', timeZone: timezone });
    if (!map.has(key)) map.set(key, []);
    map.get(key).push(b);
  });
  return [...map.entries()];
}

function Stat({ label, value }) {
  return (
    <div className="bg-card px-5 py-4">
      <dt className="text-sm text-muted-foreground">{label}</dt>
      <dd className="mt-0.5 text-2xl font-bold tabular">{value}</dd>
    </div>
  );
}

function BookingRow({ booking, timezone, color }) {
  const start = formatMeetingTime(booking.start_time, timezone);
  const end = booking.end_time ? formatMeetingTime(booking.end_time, timezone) : null;
  return (
    <Link to="/bookings" className="flex items-center gap-4 px-5 py-4 border-b border-border last:border-b-0 transition-all duration-200 hover:bg-secondary">
      <span className="w-3.5 h-3.5 rounded-full shrink-0" style={{ background: color || 'var(--primary)' }} />
      <div className="w-36 shrink-0 text-sm tabular text-muted-foreground">{start}{end && ` – ${end}`}</div>
      <div className="min-w-0 flex-1">
        <div className="truncate text-sm font-bold">{booking.guest_name}</div>
        <div className="truncate text-sm text-muted-foreground">Event type <span className="font-semibold text-foreground">{booking.event_name || 'Meeting'}</span></div>
      </div>
    </Link>
  );
}

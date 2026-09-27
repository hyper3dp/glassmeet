import React, { useEffect, useState, useMemo } from 'react';
import { Link } from 'react-router-dom';
import { api } from '@/lib/localApi';
import {
  Calendar, Clock, Plus, Share2, MessageCircle, Video, Users,
  CheckCircle2, CalendarDays, ArrowRight, Link2, Zap, Search,
} from 'lucide-react';
import { GlassCard, GlassButton, EmptyState, Spinner } from '@/components/glass';
import { formatMeetingDate, formatMeetingTime, buildWhatsAppShareLink } from '@/lib/whatsapp';
import { detectTimezone } from '@/lib/availability';

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

  const firstEvent = eventTypes[0];
  const bookingLink = firstEvent ? `${window.location.origin}/book/${firstEvent.id}` : '';

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

  return (
    <div className="space-y-6 animate-fade-in">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl sm:text-3xl font-semibold tracking-tight">
            Welcome back, {profile?.full_name?.split(' ')[0] || 'there'}
          </h1>
          <p className="text-muted-foreground text-sm mt-1">Here's your day at a glance.</p>
        </div>
        <div className="flex gap-2">
          <Link to="/event-types?new=true"><GlassButton variant="primary"><Plus className="w-4 h-4" /> Create event</GlassButton></Link>
          <Link to="/analytics"><GlassButton><Zap className="w-4 h-4" /> Find a time</GlassButton></Link>
          <GlassButton onClick={shareOnWhatsApp}><MessageCircle className="w-4 h-4" /> Share</GlassButton>
        </div>
      </div>

      {/* Quick actions */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
        <Link to="/event-types?new=true" className="glass-button rounded-xl p-3 flex flex-col items-center gap-2 text-center">
          <div className="w-9 h-9 rounded-xl glass flex items-center justify-center"><Plus className="w-4 h-4 accent-text" /></div>
          <span className="text-xs font-medium">Create Event</span>
        </Link>
        <Link to="/analytics" className="glass-button rounded-xl p-3 flex flex-col items-center gap-2 text-center">
          <div className="w-9 h-9 rounded-xl glass flex items-center justify-center"><Zap className="w-4 h-4 accent-text" /></div>
          <span className="text-xs font-medium">Find a Time</span>
        </Link>
        <button onClick={copyLink} className="glass-button rounded-xl p-3 flex flex-col items-center gap-2 text-center">
          <div className="w-9 h-9 rounded-xl glass flex items-center justify-center"><Link2 className="w-4 h-4 accent-text" /></div>
          <span className="text-xs font-medium">{copied ? 'Copied' : 'Share Link'}</span>
        </button>
        <button onClick={shareOnWhatsApp} className="glass-button rounded-xl p-3 flex flex-col items-center gap-2 text-center">
          <div className="w-9 h-9 rounded-xl glass flex items-center justify-center"><MessageCircle className="w-4 h-4 accent-text" /></div>
          <span className="text-xs font-medium">WhatsApp</span>
        </button>
      </div>

      {/* Stat cards */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        <StatCard icon={CalendarDays} label="Today's meetings" value={todays.length} />
        <StatCard icon={Clock} label="Upcoming" value={upcoming.length} />
        <StatCard icon={Users} label="Total bookings" value={bookings.length} />
        <StatCard icon={CheckCircle2} label="Event types" value={eventTypes.length} />
      </div>

      {/* Booking link card */}
      {firstEvent && (
        <GlassCard hover={false} className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
          <div className="flex items-center gap-4">
            <div className="w-12 h-12 rounded-2xl glass flex items-center justify-center">
              <Share2 className="w-5 h-5 accent-text" />
            </div>
            <div className="min-w-0">
              <div className="text-sm font-medium text-muted-foreground">Your booking link</div>
              <div className="font-medium truncate max-w-xs sm:max-w-md">{bookingLink}</div>
            </div>
          </div>
          <div className="flex gap-2">
            <GlassButton size="sm" onClick={copyLink}>{copied ? <CheckCircle2 className="w-4 h-4 accent-text" /> : 'Copy'}</GlassButton>
            <GlassButton size="sm" variant="primary" onClick={shareOnWhatsApp}><MessageCircle className="w-4 h-4" /> WhatsApp</GlassButton>
          </div>
        </GlassCard>
      )}

      <div className="grid lg:grid-cols-2 gap-6">
        {/* Upcoming */}
        <GlassCard hover={false}>
          <div className="flex items-center justify-between mb-4">
            <h2 className="font-semibold">Upcoming meetings</h2>
            <Link to="/bookings" className="text-xs accent-text font-medium flex items-center gap-1">View all <ArrowRight className="w-3 h-3" /></Link>
          </div>
          {upcoming.length === 0 ? (
            <EmptyState icon={Calendar} title="No meetings yet" description="Your calendar is clear. Create an event and share your booking link." />
          ) : (
            <div className="space-y-3">
              {upcoming.slice(0, 5).map((b) => (
                <BookingRow key={b.id} booking={b} timezone={timezone} />
              ))}
            </div>
          )}
        </GlassCard>

        {/* Recent bookings */}
        <GlassCard hover={false}>
          <div className="flex items-center justify-between mb-4">
            <h2 className="font-semibold">Recent bookings</h2>
            <Link to="/bookings" className="text-xs accent-text font-medium flex items-center gap-1">View all <ArrowRight className="w-3 h-3" /></Link>
          </div>
          {recent.length === 0 ? (
            <EmptyState icon={Users} title="No bookings yet" description="When someone books a time, it'll show up here." />
          ) : (
            <div className="space-y-3">
              {recent.map((b) => (
                <BookingRow key={b.id} booking={b} timezone={timezone} compact />
              ))}
            </div>
          )}
        </GlassCard>
      </div>

      {/* Event types quick */}
      <GlassCard hover={false}>
        <div className="flex items-center justify-between mb-4">
          <h2 className="font-semibold">Your event types</h2>
          <Link to="/event-types" className="text-xs accent-text font-medium flex items-center gap-1">Manage <ArrowRight className="w-3 h-3" /></Link>
        </div>
        {eventTypes.length === 0 ? (
          <EmptyState icon={Plus} title="No event types" description="Create your first event type to start accepting bookings." action={<Link to="/event-types?new=true"><GlassButton variant="primary" size="sm"><Plus className="w-4 h-4" /> Create event</GlassButton></Link>} />
        ) : (
          <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-3">
            {eventTypes.map((e) => (
              <Link key={e.id} to={`/book/${e.id}`} className="glass-button rounded-2xl p-4 block">
                <div className="flex items-center gap-3 mb-2">
                  <div className="w-9 h-9 rounded-xl flex items-center justify-center" style={{ background: (e.color||'#0A84FF')+'22' }}>
                    <Clock className="w-4 h-4" style={{ color: e.color || '#0A84FF' }} />
                  </div>
                  <div className="min-w-0">
                    <div className="font-medium text-sm truncate">{e.name}</div>
                    <div className="text-xs text-muted-foreground">{e.duration} min</div>
                  </div>
                </div>
                <div className="text-xs text-muted-foreground truncate">{e.location || 'Meeting'}</div>
              </Link>
            ))}
          </div>
        )}
      </GlassCard>
    </div>
  );
}

function StatCard({ icon: Icon, label, value }) {
  return (
    <GlassCard className="!p-5">
      <div className="flex items-center gap-3 mb-2">
        <div className="w-9 h-9 rounded-xl glass flex items-center justify-center">
          <Icon className="w-4 h-4 accent-text" />
        </div>
      </div>
      <div className="text-2xl font-semibold">{value}</div>
      <div className="text-xs text-muted-foreground">{label}</div>
    </GlassCard>
  );
}

function BookingRow({ booking, timezone, compact }) {
  const date = formatMeetingDate(booking.start_time, timezone);
  const time = formatMeetingTime(booking.start_time, timezone);
  return (
    <div className="flex items-center gap-3 p-3 rounded-xl glass">
      <div className="w-10 h-10 rounded-xl accent-bg flex items-center justify-center text-white text-xs font-semibold shrink-0">
        {new Date(booking.start_time).getDate()}
      </div>
      <div className="min-w-0 flex-1">
        <div className="font-medium text-sm truncate">{booking.guest_name}</div>
        <div className="text-xs text-muted-foreground truncate">{booking.event_name || 'Meeting'} · {time}</div>
        {!compact && <div className="text-xs text-muted-foreground">{date}</div>}
      </div>
      {booking.status === 'cancelled' && <span className="text-xs text-red-500 font-medium">Cancelled</span>}
    </div>
  );
}
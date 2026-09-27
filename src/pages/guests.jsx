import React, { useEffect, useState, useMemo } from 'react';
import { api } from '@/lib/localApi';
import { Users, Search, Mail, Phone, Clock, ArrowRight } from 'lucide-react';
import { GlassCard, GlassInput, EmptyState, Spinner, GlassButton } from '@/components/glass';
import { formatMeetingDate, formatMeetingTime } from '@/lib/whatsapp';

export default function Guests({ profile }) {
  const [bookings, setBookings] = useState([]);
  const [loading, setLoading] = useState(true);
  const [query, setQuery] = useState('');

  useEffect(() => {
    (async () => {
      try {
        const b = await api.entities.Booking.filter({ host_id: profile.id }, '-created_date', 200);
        setBookings(b);
      } catch {}
      setLoading(false);
    })();
  }, [profile.id]);

  // Build guest profiles from bookings
  const guests = useMemo(() => {
    const map = {};
    bookings.forEach((b) => {
      const key = b.guest_email || b.guest_name;
      if (!map[key]) {
        map[key] = { name: b.guest_name, email: b.guest_email, phone: b.guest_phone, bookings: [], lastBooking: null };
      }
      map[key].bookings.push(b);
      if (!map[key].lastBooking || new Date(b.start_time) > new Date(map[key].lastBooking.start_time)) {
        map[key].lastBooking = b;
      }
    });
    return Object.values(map).map((g) => ({ ...g, totalBookings: g.bookings.length }))
      .filter((g) => !query || g.name?.toLowerCase().includes(query.toLowerCase()) || g.email?.toLowerCase().includes(query.toLowerCase()))
      .sort((a, b) => b.totalBookings - a.totalBookings);
  }, [bookings, query]);

  if (loading) return <div className="flex justify-center py-24"><Spinner className="w-8 h-8" /></div>;

  return (
    <div className="space-y-6 animate-fade-in">
      <div>
        <h1 className="text-2xl sm:text-3xl font-semibold tracking-tight">Guests</h1>
        <p className="text-muted-foreground text-sm mt-1">People who have booked meetings with you.</p>
      </div>

      <div className="relative max-w-sm">
        <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
        <GlassInput value={query} onChange={(e) => setQuery(e.target.value)} placeholder="Search guests…" className="pl-10" />
      </div>

      {guests.length === 0 ? (
        <GlassCard hover={false}>
          <EmptyState icon={Users} title="No guests yet" description="When someone books a meeting with you, they'll appear here." />
        </GlassCard>
      ) : (
        <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-4">
          {guests.map((g, i) => {
            const key = g.email || g.name + i;
            return (
              <GlassCard key={key} className="flex flex-col">
                <div className="flex items-center gap-3 mb-3">
                  <div className="w-11 h-11 rounded-2xl glass flex items-center justify-center shrink-0">
                    <span className="text-sm font-semibold accent-text">{(g.name || '?')[0]}</span>
                  </div>
                  <div className="min-w-0 flex-1">
                    <div className="font-medium text-sm truncate">{g.name}</div>
                    <div className="text-xs text-muted-foreground">{g.totalBookings} booking{g.totalBookings !== 1 ? 's' : ''}</div>
                  </div>
                </div>
                <div className="space-y-1.5 text-xs text-muted-foreground">
                  {g.email && <div className="flex items-center gap-1.5"><Mail className="w-3 h-3" /> <span className="truncate">{g.email}</span></div>}
                  {g.phone && <div className="flex items-center gap-1.5"><Phone className="w-3 h-3" /> <span className="truncate">{g.phone}</span></div>}
                  {g.lastBooking && (
                    <div className="flex items-center gap-1.5">
                      <Clock className="w-3 h-3" /> Last: {formatMeetingDate(g.lastBooking.start_time, profile.timezone)}
                    </div>
                  )}
                </div>
              </GlassCard>
            );
          })}
        </div>
      )}
    </div>
  );
}
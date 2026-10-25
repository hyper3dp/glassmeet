import React, { useEffect, useState, useMemo } from 'react';
import { api } from '@/lib/localApi';
import { BarChart3, TrendingUp, Clock, Users, Calendar } from 'lucide-react';
import { GlassCard, EmptyState, Spinner, PageHeader } from '@/components/glass';
import { detectTimezone } from '@/lib/Availability.js';

const WEEKDAYS = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];

// weekday, hour and month of an instant in the host's zone (not the browser's)
const zoneFormatters = {};
const inZone = (iso, tz) => {
  const f = zoneFormatters[tz] || (zoneFormatters[tz] = new Intl.DateTimeFormat('en-US', {
    timeZone: tz, weekday: 'short', hour: 'numeric', hourCycle: 'h23', year: 'numeric', month: '2-digit',
  }));
  const p = {};
  for (const { type, value } of f.formatToParts(new Date(iso))) p[type] = value;
  return { day: WEEKDAYS.indexOf(p.weekday), hour: Number(p.hour), month: `${p.year}-${p.month}` };
};
import {
  BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer, CartesianGrid,
} from 'recharts';

export default function Analytics({ profile }) {
  const [bookings, setBookings] = useState([]);
  const [eventTypes, setEventTypes] = useState([]);
  const [loading, setLoading] = useState(true);
  const timezone = profile?.timezone || detectTimezone();
  // canceled and declined bookings don't count towards popularity, length or attendees
  const held = useMemo(() => bookings.filter((b) => b.status !== 'cancelled'), [bookings]);

  useEffect(() => {
    (async () => {
      try {
        const [b, e] = await Promise.all([
          api.entities.Booking.filter({ host_id: profile.id }, '-created_date', 200),
          api.entities.EventType.filter({ created_by_id: profile.id }, '-created_date'),
        ]);
        setBookings(b);
        setEventTypes(e);
      } catch {}
      setLoading(false);
    })();
  }, [profile.id]);

  const stats = useMemo(() => {
    const total = bookings.length;
    const completed = bookings.filter((b) => b.status === 'completed').length;
    const cancelled = bookings.filter((b) => b.status === 'cancelled').length;
    const confirmed = bookings.filter((b) => b.status === 'confirmed').length;

    // Most popular event
    const eventCounts = {};
    held.forEach((b) => { eventCounts[b.event_name] = (eventCounts[b.event_name] || 0) + 1; });
    const popularEvent = Object.entries(eventCounts).sort((a, b) => b[1] - a[1])[0];

    // Most popular booking time (hour of day)
    const hourCounts = {};
    held.forEach((b) => {
      const h = inZone(b.start_time, timezone).hour;
      hourCounts[h] = (hourCounts[h] || 0) + 1;
    });
    const rankedHours = Object.entries(hourCounts).sort((a, b) => b[1] - a[1]);
    const popularHour = rankedHours[0] && rankedHours[0][1] > 1 && (!rankedHours[1] || rankedHours[0][1] > rankedHours[1][1]) ? rankedHours[0] : null;

    // Average length of the meetings actually booked
    const timed = held.filter((b) => b.end_time);
    const avgDuration = timed.length
      ? Math.round(timed.reduce((sum, b) => sum + (new Date(b.end_time) - new Date(b.start_time)) / 60000, 0) / timed.length)
      : 0;

    return {
      total, completed, cancelled, confirmed,
      popularEvent: popularEvent ? popularEvent[0] : '—',
      popularHour: popularHour ? new Date(2000, 0, 1, Number(popularHour[0])).toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit' }) : 'Not enough data',
      avgDuration,
      attendees: held.reduce((sum, b) => sum + (b.attendee_count || 1), 0),
    };
  }, [bookings, held, timezone]);

  // Heatmap data: 7 days x 12 hours (8am-8pm)
  const heatmap = useMemo(() => {
    const grid = Array.from({ length: 7 }, () => Array.from({ length: 12 }, () => 0));
    held.forEach((b) => {
      const { day, hour } = inZone(b.start_time, timezone);
      if (day >= 0 && hour >= 8 && hour < 20) grid[day][hour - 8]++;
    });
    return grid;
  }, [held, timezone]);

  const maxHeat = Math.max(1, ...heatmap.flat());

  const days = WEEKDAYS;
  const hours = ['8', '9', '10', '11', '12', '1', '2', '3', '4', '5', '6', '7'];

  // one bar per calendar month (by year too, so Oct 2025 and Oct 2026 stay apart), in order
  const chartData = useMemo(() => {
    const months = {};
    held.forEach((b) => {
      const key = inZone(b.start_time, timezone).month;
      months[key] = (months[key] || 0) + 1;
    });
    return Object.keys(months).sort().map((key) => {
      const [y, m] = key.split('-').map(Number);
      return { month: new Date(y, m - 1, 1).toLocaleDateString('en-US', { month: 'short', year: 'numeric' }), bookings: months[key] };
    });
  }, [held, timezone]);

  if (loading) return <div className="flex justify-center py-24"><Spinner className="w-8 h-8" /></div>;

  return (
    <div className="space-y-6 animate-fade-in">
      <PageHeader title="Analytics" description="How guests book with you." />

      <dl className="grid grid-cols-2 lg:grid-cols-4 gap-px overflow-hidden rounded-xl border border-border bg-border shadow-card">
        <StatCard label="Total booked" value={stats.total} />
        <StatCard label="Confirmed" value={stats.confirmed} />
        <StatCard label="Canceled" value={stats.cancelled} />
        <StatCard label="Average length" value={`${stats.avgDuration} min`} />
      </dl>

      <div className="grid lg:grid-cols-2 gap-6">
        {/* Insights */}
        <GlassCard hover={false}>
          <h2 className="text-lg font-bold mb-3">Insights</h2>
          <div className="space-y-3">
            <InsightRow icon={TrendingUp} label="Most popular event" value={stats.popularEvent} />
            <InsightRow icon={Clock} label="Most popular time" value={stats.popularHour} />
            <InsightRow icon={Users} label="Total attendees" value={stats.attendees} />
            <InsightRow icon={Calendar} label="Event types" value={eventTypes.length} />
          </div>
        </GlassCard>

        {/* Monthly chart */}
        <GlassCard hover={false}>
          <h2 className="text-lg font-bold mb-4">Bookings by month</h2>
          {chartData.length === 0 ? (
            <EmptyState icon={BarChart3} title="No bookings yet" description="This chart fills in as guests book." />
          ) : (
            <ResponsiveContainer width="100%" height={200}>
              <BarChart data={chartData}>
                <CartesianGrid vertical={false} stroke="var(--border)" />
                <XAxis dataKey="month" axisLine={false} tickLine={false} tick={{ fontSize: 12, fill: 'var(--muted-foreground)' }} />
                <YAxis axisLine={false} tickLine={false} width={28} tick={{ fontSize: 12, fill: 'var(--muted-foreground)' }} allowDecimals={false} />
                <Tooltip
                  cursor={{ fill: 'var(--secondary)' }}
                  contentStyle={{ background: 'var(--popover)', color: 'var(--foreground)', border: '1px solid var(--border)', borderRadius: '8px', fontSize: '12px', boxShadow: 'var(--shadow-pop)' }}
                />
                <Bar dataKey="bookings" fill="var(--chart-1)" radius={[4, 4, 0, 0]} maxBarSize={40} />
              </BarChart>
            </ResponsiveContainer>
          )}
        </GlassCard>
      </div>

      {/* Heatmap */}
      <GlassCard hover={false}>
        <h2 className="text-lg font-bold mb-1">Busiest times</h2>
        <p className="text-sm text-muted-foreground mb-4">Bookings by weekday and hour, 8am to 8pm.</p>
        <div>
          <div>
            <div className="flex gap-0.5 sm:gap-1 mb-1 ml-9 sm:ml-11">
              {hours.map((h, i) => (
                <div key={i} className="flex-1 text-center text-[10px] text-muted-foreground">{h}</div>
              ))}
            </div>
            {heatmap.map((row, dayIdx) => (
              <div key={dayIdx} className="flex items-center gap-1 mb-0.5 sm:mb-1">
                <div className="w-8 sm:w-10 shrink-0 text-xs text-muted-foreground">{days[dayIdx]}</div>
                <div className="flex gap-0.5 sm:gap-1 flex-1 min-w-0">
                  {row.map((count, hourIdx) => {
                    const intensity = count / maxHeat;
                    return (
                      <div
                        key={hourIdx}
                        className="flex-1 min-w-0 aspect-square rounded-[3px] sm:rounded"
                        style={{
                          background: count === 0
                            ? 'var(--muted)'
                            : `color-mix(in srgb, var(--primary) ${Math.round(20 + intensity * 80)}%, transparent)`,
                        }}
                        title={`${days[dayIdx]} ${hours[hourIdx]}:00 — ${count} booking${count !== 1 ? 's' : ''}`}
                      />
                    );
                  })}
                </div>
              </div>
            ))}
          </div>
        </div>
      </GlassCard>
    </div>
  );
}

function StatCard({ label, value }) {
  return (
    <div className="bg-card px-5 py-4">
      <dt className="text-sm text-muted-foreground">{label}</dt>
      <dd className="mt-0.5 text-2xl font-bold tabular">{value}</dd>
    </div>
  );
}

function InsightRow({ icon: Icon, label, value }) {
  return (
    <div className="flex items-center justify-between py-3 border-b border-border last:border-0">
      <div className="flex items-center gap-2 text-sm text-muted-foreground">
        <Icon className="w-4 h-4" /> {label}
      </div>
      <div className="text-sm font-bold">{value}</div>
    </div>
  );
}
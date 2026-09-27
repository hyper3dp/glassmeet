import React, { useEffect, useState, useMemo } from 'react';
import { api } from '@/lib/localApi';
import {
  BarChart3, TrendingUp, CheckCircle2, XCircle, RefreshCw, Clock, Users, Calendar,
} from 'lucide-react';
import { GlassCard, GlassButton, EmptyState, Spinner } from '@/components/glass';
import {
  BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer, CartesianGrid,
} from 'recharts';

export default function Analytics({ profile }) {
  const [bookings, setBookings] = useState([]);
  const [eventTypes, setEventTypes] = useState([]);
  const [loading, setLoading] = useState(true);

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
    bookings.forEach((b) => { eventCounts[b.event_name] = (eventCounts[b.event_name] || 0) + 1; });
    const popularEvent = Object.entries(eventCounts).sort((a, b) => b[1] - a[1])[0];

    // Most popular booking time (hour of day)
    const hourCounts = {};
    bookings.forEach((b) => {
      const h = new Date(b.start_time).getHours();
      hourCounts[h] = (hourCounts[h] || 0) + 1;
    });
    const popularHour = Object.entries(hourCounts).sort((a, b) => b[1] - a[1])[0];

    // Average duration
    const avgDuration = eventTypes.length
      ? Math.round(eventTypes.reduce((sum, e) => sum + (e.duration || 30), 0) / eventTypes.length)
      : 0;

    return {
      total, completed, cancelled, confirmed,
      popularEvent: popularEvent ? popularEvent[0] : '—',
      popularHour: popularHour ? `${popularHour[0]}:00` : '—',
      avgDuration,
    };
  }, [bookings, eventTypes]);

  // Heatmap data: 7 days x 12 hours (8am-8pm)
  const heatmap = useMemo(() => {
    const grid = Array.from({ length: 7 }, () => Array.from({ length: 12 }, () => 0));
    bookings.forEach((b) => {
      const d = new Date(b.start_time);
      const day = d.getDay();
      const hour = d.getHours();
      if (hour >= 8 && hour < 20) grid[day][hour - 8]++;
    });
    return grid;
  }, [bookings]);

  const maxHeat = Math.max(1, ...heatmap.flat());

  const days = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
  const hours = ['8', '9', '10', '11', '12', '1', '2', '3', '4', '5', '6', '7'];

  const chartData = useMemo(() => {
    const months = {};
    bookings.forEach((b) => {
      const m = new Date(b.start_time).toLocaleDateString('en', { month: 'short' });
      months[m] = (months[m] || 0) + 1;
    });
    return Object.entries(months).map(([month, count]) => ({ month, bookings: count }));
  }, [bookings]);

  if (loading) return <div className="flex justify-center py-24"><Spinner className="w-8 h-8" /></div>;

  return (
    <div className="space-y-6 animate-fade-in">
      <div>
        <h1 className="text-2xl sm:text-3xl font-semibold tracking-tight">Analytics</h1>
        <p className="text-muted-foreground text-sm mt-1">Booking insights and trends.</p>
      </div>

      {/* Stat cards */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        <StatCard icon={BarChart3} label="Total booked" value={stats.total} />
        <StatCard icon={CheckCircle2} label="Confirmed" value={stats.confirmed} />
        <StatCard icon={XCircle} label="Cancelled" value={stats.cancelled} />
        <StatCard icon={Clock} label="Avg duration" value={`${stats.avgDuration}m`} />
      </div>

      <div className="grid lg:grid-cols-2 gap-6">
        {/* Insights */}
        <GlassCard hover={false}>
          <h2 className="font-semibold mb-4">Insights</h2>
          <div className="space-y-3">
            <InsightRow icon={TrendingUp} label="Most popular event" value={stats.popularEvent} />
            <InsightRow icon={Clock} label="Most popular time" value={stats.popularHour} />
            <InsightRow icon={Users} label="Total attendees" value={bookings.reduce((s, b) => s + (b.attendee_count || 1), 0)} />
            <InsightRow icon={Calendar} label="Event types" value={eventTypes.length} />
          </div>
        </GlassCard>

        {/* Monthly chart */}
        <GlassCard hover={false}>
          <h2 className="font-semibold mb-4">Bookings over time</h2>
          {chartData.length === 0 ? (
            <EmptyState icon={BarChart3} title="No data yet" description="Bookings will appear here once you have data." />
          ) : (
            <ResponsiveContainer width="100%" height={200}>
              <BarChart data={chartData}>
                <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" />
                <XAxis dataKey="month" tick={{ fontSize: 12, fill: 'hsl(var(--muted-foreground))' }} />
                <YAxis tick={{ fontSize: 12, fill: 'hsl(var(--muted-foreground))' }} allowDecimals={false} />
                <Tooltip
                  contentStyle={{ background: 'hsl(var(--card))', border: '1px solid hsl(var(--border))', borderRadius: '12px', fontSize: '12px' }}
                />
                <Bar dataKey="bookings" fill="hsl(var(--accent-color))" radius={[6, 6, 0, 0]} />
              </BarChart>
            </ResponsiveContainer>
          )}
        </GlassCard>
      </div>

      {/* Heatmap */}
      <GlassCard hover={false}>
        <h2 className="font-semibold mb-4">Booking heatmap</h2>
        <div className="overflow-x-auto">
          <div className="min-w-[480px]">
            <div className="flex gap-1 mb-1 ml-10">
              {hours.map((h, i) => (
                <div key={i} className="flex-1 text-center text-[10px] text-muted-foreground">{h}</div>
              ))}
            </div>
            {heatmap.map((row, dayIdx) => (
              <div key={dayIdx} className="flex items-center gap-1 mb-1">
                <div className="w-10 text-xs text-muted-foreground">{days[dayIdx]}</div>
                <div className="flex gap-1 flex-1">
                  {row.map((count, hourIdx) => {
                    const intensity = count / maxHeat;
                    return (
                      <div
                        key={hourIdx}
                        className="flex-1 aspect-square rounded-md transition"
                        style={{
                          background: count === 0
                            ? 'hsl(var(--muted))'
                            : `hsl(var(--accent-color) / ${0.2 + intensity * 0.8})`,
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

function InsightRow({ icon: Icon, label, value }) {
  return (
    <div className="flex items-center justify-between py-2 border-b border-border/40 last:border-0">
      <div className="flex items-center gap-2 text-sm text-muted-foreground">
        <Icon className="w-4 h-4" /> {label}
      </div>
      <div className="text-sm font-medium">{value}</div>
    </div>
  );
}
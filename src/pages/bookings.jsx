import React, { useEffect, useState, useMemo } from 'react';
import { api } from '@/lib/localApi';
import {
  BookOpen, Calendar, Clock, MessageCircle, Copy, Check, X, Trash2, Mail, Phone, FileText, Video, RefreshCw,
} from 'lucide-react';
import { GlassCard, GlassButton, GlassInput, GlassTextarea, GlassLabel, EmptyState, Spinner } from '@/components/glass';
import {
  formatMeetingDate, formatMeetingTime, buildWhatsAppLink, fillTemplate, buildBookingContext,
} from '@/lib/whatsapp';
import { detectTimezone } from '@/lib/availability';

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
    if (filter === 'past') list = bookings.filter((b) => new Date(b.start_time) < now).sort((a,b)=> new Date(b.start_time)-new Date(b.start_time)).reverse();
    if (filter === 'cancelled') list = bookings.filter((b) => b.status === 'cancelled');
    return list;
  }, [bookings, filter]);

  const cancel = async (id) => {
    if (!confirm('Cancel this meeting? The guest will need to be notified.')) return;
    await api.entities.Booking.update(id, { status: 'cancelled' });
    load();
  };

  if (loading) return <div className="flex justify-center py-24"><Spinner /></div>;

  return (
    <div className="space-y-6 animate-fade-in">
      <div>
        <h1 className="text-2xl sm:text-3xl font-semibold tracking-tight">Bookings</h1>
        <p className="text-muted-foreground text-sm mt-1">Manage all your scheduled meetings.</p>
      </div>

      <div className="flex gap-2 glass rounded-full p-1 w-fit">
        {['upcoming','past','cancelled'].map((f) => (
          <button key={f} onClick={()=>setFilter(f)} className={`px-4 py-1.5 rounded-full text-sm font-medium capitalize transition ${filter===f ? 'accent-bg text-white' : 'text-muted-foreground'}`}>{f}</button>
        ))}
      </div>

      {filtered.length === 0 ? (
        <GlassCard hover={false}>
          <EmptyState icon={BookOpen} title="No bookings here" description={filter==='upcoming' ? "You're all clear. Share your booking link to get started." : "Nothing to show in this view."} />
        </GlassCard>
      ) : (
        <div className="space-y-3">
          {filtered.map((b) => (
            <BookingCard key={b.id} booking={b} timezone={timezone} whatsapp={whatsapp} onView={()=>setSelected(b)} onCancel={()=>cancel(b.id)} />
          ))}
        </div>
      )}

      {selected && (
        <BookingDetail booking={selected} timezone={timezone} whatsapp={whatsapp} profile={profile} onClose={()=>setSelected(null)} onCancel={()=>{ cancel(selected.id); setSelected(null); }} onChanged={load} />
      )}
    </div>
  );
}

function BookingCard({ booking, timezone, whatsapp, onView, onCancel }) {
  const date = formatMeetingDate(booking.start_time, timezone);
  const time = formatMeetingTime(booking.start_time, timezone);
  const cancelled = booking.status === 'cancelled';

  const sendWhatsApp = () => {
    const ctx = { guestName: booking.guest_name, hostName: '', date, time, duration: '', meetingUrl: booking.meeting_url || '', timezone };
    const tmpl = whatsapp?.confirmation_template || `Hi [Name]! Your meeting is confirmed for [Date] at [Time]. Meeting: [Meeting Link]`;
    const msg = fillTemplate(tmpl, ctx);
    window.open(buildWhatsAppLink(booking.guest_phone, msg), '_blank');
  };

  return (
    <GlassCard className="flex flex-col sm:flex-row sm:items-center gap-4">
      <div className="flex items-center gap-4 flex-1 min-w-0">
        <div className={`w-12 h-12 rounded-2xl flex flex-col items-center justify-center shrink-0 ${cancelled ? 'glass' : 'accent-bg text-white'}`}>
          <span className="text-[10px] uppercase">{new Date(booking.start_time).toLocaleString('en-US',{month:'short'})}</span>
          <span className="text-lg font-semibold leading-none">{new Date(booking.start_time).getDate()}</span>
        </div>
        <div className="min-w-0">
          <div className="font-semibold truncate">{booking.guest_name}</div>
          <div className="text-sm text-muted-foreground truncate">{booking.event_name} · {time} · {date}</div>
        </div>
      </div>
      <div className="flex gap-2">
        <GlassButton size="sm" onClick={onView}>Details</GlassButton>
        {!cancelled && <GlassButton size="sm" variant="primary" onClick={sendWhatsApp}><MessageCircle className="w-3.5 h-3.5" /> WhatsApp</GlassButton>}
        {!cancelled && <button onClick={onCancel} className="w-9 h-9 rounded-xl glass flex items-center justify-center text-red-500"><X className="w-4 h-4" /></button>}
      </div>
    </GlassCard>
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

  const saveNotes = async () => {
    await api.entities.Booking.update(booking.id, { notes, meeting_url: meetingUrl });
    onChanged();
    onClose();
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/30 backdrop-blur-sm animate-fade-in" onClick={onClose}>
      <div className="glass-panel w-full max-w-lg max-h-[90vh] overflow-y-auto p-6 animate-scale-in" onClick={(e)=>e.stopPropagation()}>
        <div className="flex items-center justify-between mb-5">
          <h2 className="text-lg font-semibold">Meeting details</h2>
          <button onClick={onClose} className="w-8 h-8 rounded-lg glass flex items-center justify-center"><X className="w-4 h-4" /></button>
        </div>

        <div className="space-y-4">
          <div className="glass rounded-2xl p-4">
            <div className="font-semibold text-lg mb-1">{booking.event_name}</div>
            <div className="flex items-center gap-2 text-sm text-muted-foreground"><Calendar className="w-4 h-4" /> {formatMeetingDate(booking.start_time, timezone)}</div>
            <div className="flex items-center gap-2 text-sm text-muted-foreground"><Clock className="w-4 h-4" /> {formatMeetingTime(booking.start_time, timezone)} ({timezone})</div>
          </div>

          <div className="grid grid-cols-2 gap-3 text-sm">
            <InfoRow icon={Mail} label="Email" value={booking.guest_email} />
            <InfoRow icon={Phone} label="WhatsApp" value={booking.guest_phone} />
          </div>
          {booking.guest_notes && (
            <div>
              <GlassLabel>Guest notes</GlassLabel>
              <div className="glass rounded-xl p-3 text-sm text-muted-foreground">{booking.guest_notes}</div>
            </div>
          )}

          <div>
            <GlassLabel>Meeting URL</GlassLabel>
            <div className="flex gap-2">
              <GlassInput value={meetingUrl} onChange={(e)=>setMeetingUrl(e.target.value)} placeholder="https://..." />
              <GlassButton onClick={copyLink}>{copied ? <Check className="w-4 h-4 accent-text" /> : <Copy className="w-4 h-4" />}</GlassButton>
            </div>
          </div>

          <div>
            <GlassLabel>Host notes</GlassLabel>
            <GlassTextarea rows={3} value={notes} onChange={(e)=>setNotes(e.target.value)} placeholder="Private notes about this meeting..." />
          </div>

          <div className="glass rounded-2xl p-3">
            <div className="text-xs text-muted-foreground mb-1.5 flex items-center gap-1.5"><MessageCircle className="w-3.5 h-3.5" /> WhatsApp message</div>
            <pre className="text-sm whitespace-pre-wrap font-body text-foreground">{waMsg}</pre>
          </div>
        </div>

        <div className="flex flex-col sm:flex-row gap-2 mt-6">
          <GlassButton variant="primary" className="flex-1" onClick={()=>window.open(buildWhatsAppLink(booking.guest_phone, waMsg), '_blank')}><MessageCircle className="w-4 h-4" /> Send on WhatsApp</GlassButton>
          <GlassButton className="flex-1" onClick={saveNotes}>Save</GlassButton>
          {booking.status !== 'cancelled' && <GlassButton variant="danger" onClick={onCancel}><Trash2 className="w-4 h-4" /> Cancel</GlassButton>}
        </div>
      </div>
    </div>
  );
}

function InfoRow({ icon: Icon, label, value }) {
  return (
    <div className="glass rounded-xl p-3">
      <div className="text-xs text-muted-foreground flex items-center gap-1.5 mb-0.5"><Icon className="w-3 h-3" /> {label}</div>
      <div className="font-medium truncate">{value}</div>
    </div>
  );
}
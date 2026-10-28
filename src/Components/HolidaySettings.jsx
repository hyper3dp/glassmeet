import React, { useEffect, useMemo, useState } from 'react';
import { Link, useLocation } from 'react-router-dom';
import { CalendarHeart, MessageCircle, Copy, Check, X, AlertTriangle } from 'lucide-react';
import { api } from '@/lib/localApi';
import { GlassButton, GlassTextarea } from '@/components/glass';
import { Switch } from '@/components/ui/switch';
import { Dialog, DialogContent, DialogTitle } from '@/components/ui/dialog';
import { HOLIDAY_REGIONS, holidayClashes, rescheduleMessage } from '@/lib/holidays.js';
import { buildWhatsAppLink, formatMeetingDate, formatMeetingTime } from '@/lib/whatsapp';
import { detectTimezone, formatDate } from '@/lib/Availability.js';
import { appPath } from '@/lib/authReturnTo';

const REGION = 'ae';
const KEPT_KEY = 'gm-holiday-kept'; // bookings the host chose to keep (this browser)

const readKept = () => { try { return new Set(JSON.parse(localStorage.getItem(KEPT_KEY) || '[]')); } catch { return new Set(); } };
const saveKept = (set) => { try { localStorage.setItem(KEPT_KEY, JSON.stringify([...set])); } catch {} };
const dayLabel = (date) => new Date(`${date}T00:00`).toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric', year: 'numeric' });

// Availability: block the host's public holidays with one switch. Bookings already on a holiday
// are listed so the host can keep them, or cancel and message the guest to pick a new time.
export default function HolidaySettings({ profile, updateProfile }) {
  const location = useLocation();
  const timezone = profile?.timezone || detectTimezone();
  const [region, setRegion] = useState(profile?.holidays || null);
  const [holidays, setHolidays] = useState([]);
  const [bookings, setBookings] = useState([]);
  const [kept, setKept] = useState(readKept);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  const [reviewing, setReviewing] = useState(false);

  // a holiday notification links here with ?holidays=review
  const wantsReview = new URLSearchParams(location.search).get('holidays') === 'review';

  useEffect(() => {
    api.entities.Booking.filter({ host_id: profile.id }, '-start_time', 500).then(setBookings).catch(() => setBookings([]));
  }, [profile.id]);

  useEffect(() => {
    api.holidays.forRegion(region).then(setHolidays).catch(() => setHolidays([]));
  }, [region]);

  const clashes = useMemo(() => (region ? holidayClashes(bookings, holidays, timezone) : []), [region, bookings, holidays, timezone]);
  const open = clashes.filter((c) => !kept.has(c.booking.id));

  useEffect(() => { if (wantsReview && open.length) setReviewing(true); }, [wantsReview, open.length]);

  const toggle = async (on) => {
    const next = on ? REGION : null;
    setRegion(next);
    setError('');
    setSaving(true);
    try {
      await updateProfile({ holidays: next });
      if (on) {
        // review straight away when holidays land on meetings already booked
        const list = await api.holidays.forRegion(next);
        setHolidays(list);
        if (holidayClashes(bookings, list, timezone).some((c) => !kept.has(c.booking.id))) setReviewing(true);
      }
    } catch (e) {
      setRegion(on ? null : REGION);
      setError(e?.message || 'Could not save this setting.');
    }
    setSaving(false);
  };

  const keep = (id) => setKept((cur) => { const next = new Set(cur).add(id); saveKept(next); return next; });
  const markCancelled = (id) => setBookings((bs) => bs.map((b) => (b.id === id ? { ...b, status: 'cancelled' } : b)));

  const today = formatDate(new Date()); // the local date, not UTC's
  const upcoming = holidays.filter((h) => h.date >= today).reduce((list, h) => {
    // one line per holiday: Eid al-Fitr spans three days
    const last = list[list.length - 1];
    if (last && last.name === h.name) last.end = h.date; else list.push({ name: h.name, start: h.date, end: h.date });
    return list;
  }, []).slice(0, 4);

  return (
    <section className="mt-6 rounded-xl border border-border bg-card shadow-card p-5 sm:p-6">
      <div className="flex items-start justify-between gap-4">
        <div className="min-w-0">
          <h2 className="text-[15px] font-bold flex items-center gap-2"><CalendarHeart className="w-4 h-4 text-muted-foreground" /> Public holidays</h2>
          <p className="mt-1 text-sm text-muted-foreground">Close bookings on public holidays automatically. They also show on your calendar.</p>
        </div>
        <Switch id="holidays-ae" checked={region === REGION} disabled={saving} onCheckedChange={toggle} />
      </div>
      <label htmlFor="holidays-ae" className="mt-4 block text-sm font-semibold cursor-pointer">Block {HOLIDAY_REGIONS[REGION]}</label>
      {error && <p role="alert" className="mt-3 text-sm text-destructive">{error}</p>}

      {region && (
        <div className="mt-4 space-y-4">
          {open.length > 0 && (
            <div className="flex flex-wrap items-center justify-between gap-3 rounded-lg border border-warning/30 bg-warning/10 px-4 py-3">
              <p className="text-sm text-foreground flex items-center gap-2">
                <AlertTriangle className="w-4 h-4 text-warning shrink-0" />
                {open.length === 1 ? '1 meeting falls on a holiday.' : `${open.length} meetings fall on holidays.`}
              </p>
              <GlassButton type="button" size="sm" onClick={() => setReviewing(true)}>Review</GlassButton>
            </div>
          )}
          {upcoming.length > 0 && (
            <ul className="divide-y divide-border rounded-lg border border-border">
              {upcoming.map((h) => (
                <li key={h.start} className="flex items-center justify-between gap-3 px-4 py-2.5 text-sm">
                  <span className="font-semibold truncate">{h.name}</span>
                  <span className="text-muted-foreground tabular shrink-0">{dayLabel(h.start)}{h.end !== h.start ? ` – ${new Date(`${h.end}T00:00`).toLocaleDateString('en-US', { month: 'short', day: 'numeric' })}` : ''}</span>
                </li>
              ))}
            </ul>
          )}
          <p className="text-sm text-muted-foreground">
            Islamic holidays follow the moon, so their dates may move by a day. <Link to="/calendar-connections" className="font-semibold text-link hover:underline">Add them to Google, Apple or Outlook</Link> with your calendar feed.
          </p>
        </div>
      )}

      {reviewing && (
        <ClashDialog clashes={open} timezone={timezone}
          onKeep={keep} onCancelled={markCancelled} onClose={() => setReviewing(false)} />
      )}
    </section>
  );
}

function ClashDialog({ clashes, timezone, onKeep, onCancelled, onClose }) {
  // rows stay listed while the dialog is open, so a cancelled one can still be messaged
  const [rows] = useState(clashes);
  const [done, setDone] = useState({}); // id -> 'kept' | 'cancelled'

  return (
    <Dialog open onOpenChange={(next) => { if (!next) onClose(); }}>
      <DialogContent showCloseButton={false} aria-describedby={undefined} className="sm:max-w-lg p-6 block max-h-[90vh] overflow-y-auto">
        <div className="flex items-center justify-between mb-2">
          <DialogTitle>Meetings on holidays</DialogTitle>
          <button type="button" onClick={onClose} aria-label="Close" className="w-8 h-8 rounded-full flex items-center justify-center text-muted-foreground hover:bg-secondary"><X className="w-4 h-4" /></button>
        </div>
        <p className="mb-5 text-sm text-muted-foreground">New bookings are closed on these days. Keep each meeting, or cancel it and ask the guest to pick a new time.</p>
        <ul className="space-y-3">
          {rows.map((c) => (
            <ClashRow key={c.booking.id} clash={c} timezone={timezone} state={done[c.booking.id]}
              onKeep={() => { onKeep(c.booking.id); setDone((d) => ({ ...d, [c.booking.id]: 'kept' })); }}
              onCancelled={() => { onCancelled(c.booking.id); setDone((d) => ({ ...d, [c.booking.id]: 'cancelled' })); }} />
          ))}
        </ul>
        <div className="mt-5 flex justify-end">
          <GlassButton type="button" variant="primary" onClick={onClose}>Done</GlassButton>
        </div>
      </DialogContent>
    </Dialog>
  );
}

function ClashRow({ clash, timezone, state, onKeep, onCancelled }) {
  const { booking, holiday } = clash;
  const bookingLink = `${window.location.origin}${appPath(`/book/${booking.event_type_id}`)}`;
  const [message, setMessage] = useState(() => rescheduleMessage({ booking, holiday, bookingLink, timezone }));
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [copied, setCopied] = useState(false);
  const [confirming, setConfirming] = useState(false); // cancelling a guest's meeting takes a second tap
  const cancelled = state === 'cancelled' || booking.status === 'cancelled';

  const cancel = async () => {
    setBusy(true);
    setError('');
    try {
      await api.entities.Booking.update(booking.id, { status: 'cancelled' });
      onCancelled();
    } catch (e) {
      setError(e?.message || 'Could not cancel this meeting.');
    }
    setBusy(false);
  };

  const copy = async () => {
    try { await navigator.clipboard.writeText(message); setCopied(true); setTimeout(() => setCopied(false), 1500); } catch { setError('Could not copy. Select the message and copy it instead.'); }
  };

  return (
    <li className="rounded-lg border border-border p-4">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="min-w-0">
          <div className="font-bold truncate">{booking.guest_name || 'Guest'}</div>
          <div className="text-sm text-muted-foreground">
            {formatMeetingDate(booking.start_time, timezone)} · {formatMeetingTime(booking.start_time, timezone)}
          </div>
          <div className="text-sm font-semibold text-link">{holiday}</div>
        </div>
        {!state && !cancelled && (confirming ? (
          <div className="flex flex-wrap items-center gap-2 shrink-0" role="group" aria-label="Confirm cancellation">
            <span className="text-sm font-semibold">Cancel this meeting?</span>
            <GlassButton type="button" size="sm" variant="ghost" onClick={() => setConfirming(false)} disabled={busy}>No</GlassButton>
            <GlassButton type="button" size="sm" variant="danger" onClick={cancel} disabled={busy}>{busy ? 'Cancelling…' : 'Yes, cancel'}</GlassButton>
          </div>
        ) : (
          <div className="flex gap-2 shrink-0">
            <GlassButton type="button" size="sm" onClick={onKeep}>Keep</GlassButton>
            <GlassButton type="button" size="sm" variant="danger" onClick={() => setConfirming(true)}>Cancel</GlassButton>
          </div>
        ))}
        {state === 'kept' && <span className="text-sm font-semibold text-success">Kept</span>}
        {cancelled && <span className="text-sm font-semibold text-destructive">Cancelled</span>}
      </div>

      {cancelled && (
        <div className="mt-4 space-y-3">
          <label htmlFor={`msg-${booking.id}`} className="block text-sm font-semibold">Message to {booking.guest_name?.split(' ')[0] || 'the guest'}</label>
          <GlassTextarea id={`msg-${booking.id}`} rows={5} value={message} onChange={(e) => setMessage(e.target.value)} />
          <div className="flex flex-wrap gap-2">
            {booking.guest_phone ? (
              <GlassButton type="button" variant="primary" onClick={() => window.open(buildWhatsAppLink(booking.guest_phone, message), '_blank')}>
                <MessageCircle className="w-4 h-4" /> Send on WhatsApp
              </GlassButton>
            ) : (
              <p className="text-sm text-muted-foreground self-center">No WhatsApp number for this guest.</p>
            )}
            <GlassButton type="button" onClick={copy}>{copied ? <Check className="w-4 h-4" /> : <Copy className="w-4 h-4" />} {copied ? 'Copied' : 'Copy message'}</GlassButton>
          </div>
        </div>
      )}
      {error && <p role="alert" className="mt-3 text-sm text-destructive">{error}</p>}
    </li>
  );
}

import React, { useEffect, useState, useMemo, useRef, lazy, Suspense } from 'react';
import { Link, useParams, useNavigate, useLocation } from 'react-router-dom';
import { api } from '@/lib/localApi';
import {
  Clock, Calendar, Globe, ChevronLeft, ChevronRight, ArrowLeft, Loader2, Video, MessageCircle,
  Users, QrCode, Clock3, CreditCard, MapPin, Phone,
} from 'lucide-react';
import { GlassInput, GlassTextarea, GlassLabel, GlassSelect, Spinner } from '@/components/glass';
import {
  generateSlots, isPastDate, isWithinMaxFuture, detectTimezone, bookingWindowDays, COMMON_TIMEZONES, dateInZone,
} from '@/lib/Availability.js';
import { formatMeetingDate, normalizePhone } from '@/lib/whatsapp';
import { getDevice } from '@/lib/devicedetect.js';
import { holidayExceptions } from '@/lib/holidays.js';
import { appPath } from '@/lib/authReturnTo';
import { isEmbed, useEmbedResize } from '@/lib/embed.js';
import { useAuth } from '@/lib/Authcontext.jsx';
import { LIMITS, onlyName, onlyPhone, onlyEmail } from '@/lib/inputRules';

// guests rarely open it (desktop only), so its dialog code loads on demand
const QRCodeModal = lazy(() => import('@/components/QrcodeModal.jsx'));

export default function BookingPage() {
  const { eventTypeId } = useParams();
  const navigate = useNavigate();
  const location = useLocation();
  const [event, setEvent] = useState(null);
  const [rules, setRules] = useState([]);
  const [exceptions, setExceptions] = useState([]);
  const [slots, setSlots] = useState([]);
  const [bookedSlots, setBookedSlots] = useState([]);
  const [googleBusy, setGoogleBusy] = useState([]);
  const [loading, setLoading] = useState(true);
  const [cursor, setCursor] = useState(new Date());
  const [selectedDate, setSelectedDate] = useState(null);
  const [selectedSlot, setSelectedSlot] = useState(null);
  const [pendingSlot, setPendingSlot] = useState(null);
  const [embed] = useState(isEmbed);
  useEmbedResize(embed);
  // inside an iframe, links that leave the booking flow open in a new tab
  const outLink = embed ? { target: '_blank', rel: 'noreferrer' } : {};
  // On one-column layouts the times and the form open below the fold; bring them into view
  const slotsRef = useRef(null);
  const formRef = useRef(null);
  const stacked = () => window.matchMedia('(max-width: 1023px)').matches;
  useEffect(() => {
    if (selectedDate && !selectedSlot && stacked()) slotsRef.current?.scrollIntoView({ behavior: 'smooth', block: 'start' });
  }, [selectedDate]);
  useEffect(() => {
    if (selectedSlot && stacked()) formRef.current?.scrollIntoView({ behavior: 'smooth', block: 'start' });
  }, [selectedSlot]);

  // Keyboard focus follows each step: the picked time's Next button, then the form's first field,
  // and back on the picked time when returning to the list.
  const nextRef = useRef(null);
  const lastPicked = useRef(null);
  useEffect(() => { if (pendingSlot !== null) nextRef.current?.focus(); }, [pendingSlot]);
  useEffect(() => {
    if (selectedSlot) {
      lastPicked.current = selectedSlot.date.getTime();
      document.getElementById('g-name')?.focus({ preventScroll: stacked() });
    } else if (lastPicked.current) {
      document.querySelector(`[data-slot-time="${lastPicked.current}"]`)?.focus({ preventScroll: stacked() });
    }
  }, [selectedSlot]);

  // The form is its own history step, so the browser's Back button returns to the times.
  const chooseSlot = (slot) => {
    setError('');
    setSlotGone(false);
    setSelectedSlot(slot);
    setPendingSlot(null);
    // one form step in history at most (after Forward, the current entry already is one)
    navigate(`${location.pathname}${location.search}`, { state: { ...(location.state || {}), bookingForm: true }, replace: !!location.state?.bookingForm });
  };
  const backToTimes = () => {
    setSelectedSlot(null);
    if (location.state?.bookingForm) navigate(-1);
  };
  useEffect(() => {
    if (!location.state?.bookingForm) setSelectedSlot(null);
  }, [location.state]);
  // a reload keeps history state but not the picked time: drop the stale form step
  useEffect(() => {
    if (location.state?.bookingForm) navigate(`${location.pathname}${location.search}`, { replace: true, state: { ...location.state, bookingForm: false } });
  }, []);
  const [form, setForm] = useState({ guest_name: '', guest_email: '', guest_phone: '', guest_notes: '' });

  // A signed-in GlassMeet user booking someone else's event gets their details filled in from
  // their account (not the host previewing their own page). Fields they already typed are kept.
  const { user } = useAuth();
  const [autofilled, setAutofilled] = useState(false);
  const filledFor = useRef(null);
  useEffect(() => {
    if (!user || !event || user.id === event.created_by_id || filledFor.current === user.id) return;
    filledFor.current = user.id;
    setForm((f) => ({
      ...f,
      guest_name: f.guest_name || user.full_name || '',
      guest_email: f.guest_email || user.email || '',
      guest_phone: f.guest_phone || user.whatsapp_number || '',
    }));
    setAutofilled(true);
  }, [user, event]);
  const clearAutofill = () => {
    setForm((f) => ({ ...f, guest_name: '', guest_email: '', guest_phone: '' }));
    setAutofilled(false);
    document.getElementById('g-name')?.focus();
  };
  const [customAnswers, setCustomAnswers] = useState({});
  const [submitting, setSubmitting] = useState(false);
  const submittingRef = useRef(false);
  const [error, setError] = useState('');
  // the picked time was taken while the guest filled in the form
  const [slotGone, setSlotGone] = useState(false);
  const [showQR, setShowQR] = useState(false);
  // the dialog unmounts on close and its focus return lands on <body>; put focus back on its
  // button after that (a timer queued after the dialog's own)
  const qrBtnRef = useRef(null);
  const qrWasOpen = useRef(false);
  useEffect(() => {
    if (showQR) { qrWasOpen.current = true; return undefined; }
    if (!qrWasOpen.current) return undefined;
    const t = setTimeout(() => qrBtnRef.current?.focus(), 0);
    return () => clearTimeout(t);
  }, [showQR]);
  const closeQR = () => setShowQR(false);
  const [loadFailed, setLoadFailed] = useState(false);
  const [showMore, setShowMore] = useState(false);

  const device = getDevice();
  const bookingUrl = `${window.location.origin}${appPath(`/book/${eventTypeId}`)}`;

  // Group meeting: count existing bookings for this event
  // Group events: several guests can take the same time. Bookings of this event at the same
  // start only block that time once it is full; everything else blocks as usual.
  const maxAttendees = event?.max_attendees || 1;
  const isGroup = event?.booking_type === 'group' && maxAttendees > 1;
  const sameStart = (b, ms) => b.event_type_id === event?.id && new Date(b.start_time).getTime() === ms;
  const spotsLeftAt = (date) => Math.max(0, maxAttendees - bookedSlots.filter((b) => sameStart(b, date.getTime())).length);

  // times show in the guest's zone; they can switch it (travelling, or booking for another city)
  const [detectedTz] = useState(detectTimezone);
  const [guestTz, setGuestTz] = useState(detectedTz);
  const tzOptions = useMemo(() => [...new Set([detectedTz, ...COMMON_TIMEZONES])], [detectedTz]);
  const dialCode = DIAL_CODES[detectedTz];
  // "today" in the zone the guest is viewing, which may not be this browser's
  const todayKey = dateInZone(Date.now(), guestTz).getTime();
  const today = new Date(todayKey);
  const phoneExample = PHONE_EXAMPLES[dialCode] || (dialCode ? `+${dialCode} …` : '+1 415 555 0123');
  // weekly hours are in the host's zone; everything the guest sees is in the guest's zone
  const hostTz = event?.host_timezone || 'UTC'; // same fallback as the server's booking check
  const emailRequired = event?.email_required ?? true;

  // asked once per shown month (a new cursor for the same month doesn't ask again)
  const cursorYear = cursor.getFullYear(), cursorMonth = cursor.getMonth();
  useEffect(() => {
    if (!event) return undefined;
    // a day either side: the month's first and last days in the guest's zone can reach into
    // the neighbouring months in this browser's
    const timeMin = new Date(cursorYear, cursorMonth, 0).toISOString();
    const timeMax = new Date(cursorYear, cursorMonth + 1, 2).toISOString();
    // Google Calendar busy times are optional (only hosts who connected Google have any); without them,
    // slots come from the host's availability and GlassMeet bookings.
    // Each month's answer is added to what's known, never swapped for it: a day picked in one
    // month stays on screen after the guest moves to the next, and must keep its busy times.
    // A failed request keeps what's known rather than offering every time as free.
    const take = (busy) => setGoogleBusy((cur) => {
      const seen = new Set(cur.map((b) => `${b.start_time}|${b.end_time}`));
      const fresh = busy.filter((b) => !seen.has(`${b.start_time}|${b.end_time}`));
      return fresh.length ? [...cur, ...fresh] : cur;
    });
    api.google.busy(event.created_by_id, timeMin, timeMax)
      .then((busy) => take(Array.isArray(busy) ? busy : []))
      .catch(() => {});
    return undefined;
  }, [event, cursorYear, cursorMonth]);

  useEffect(() => { load(); }, []);

  const load = async () => {
    let found = false;
    try {
      const ev = await api.events.getPublic(eventTypeId);
      // a switched-off event can't be booked; say so up front rather than at the last click
      if (ev.active === false) { setError('This event isn’t taking bookings right now.'); setLoading(false); return; }
      found = true;
      const hostId = ev.created_by_id;
      const [{ rules: r, exceptions: e }, b, h] = await Promise.all([
        api.availability.forHost(hostId),
        api.entities.BookedSlot.filter({ host_id: hostId, status: 'confirmed' }),
        api.holidays.forHost(hostId).catch(() => []),
      ]);
      setRules(r);
      // the host's public holidays are whole days off
      setExceptions([...e, ...holidayExceptions(h)]);
      setBookedSlots(b);
      // shown only once its times are in, so a half load never looks like a fully booked event
      setEvent(ev);
      setLoadFailed(false);
    } catch (err) {
      // offline, a slow network or a failure after the event was found isn't a missing page
      const retryable = found || !navigator.onLine || /fetch|network|timeout|load failed/i.test(err?.message || '');
      setLoadFailed(retryable);
      setError(retryable ? 'We couldn’t load this page. Check your connection and try again.' : 'This booking page could not be found. Ask the host for a new link.');
    }
    setLoading(false);
  };

  // GlassMeet bookings and Google busy times, merged once for every slot computation below
  const busyTimes = useMemo(() => [...bookedSlots, ...googleBusy], [bookedSlots, googleBusy]);

  // generate slots when a date is selected
  useEffect(() => {
    if (!selectedDate || !event) { setSlots([]); return; }
    const s = generateSlots(selectedDate, event, rules, exceptions, busyTimes, hostTz, guestTz);
    setSlots(s);
    // keep the guest's pick if it's still free (a background refresh shouldn't throw them out)
    setSelectedSlot((cur) => (cur && s.some((x) => x.date.getTime() === cur.date.getTime()) ? cur : null));
    setPendingSlot(null);
  }, [selectedDate, event, rules, exceptions, busyTimes, hostTz, guestTz]);

  const color = event?.color || '#2B7A75';

  const monthDays = useMemo(() => {
    if (!event) return [];
    const year = cursor.getFullYear(), month = cursor.getMonth();
    const first = new Date(year, month, 1);
    const startDay = first.getDay();
    const daysInMonth = new Date(year, month + 1, 0).getDate();
    const cells = [];
    for (let i = 0; i < startDay; i++) cells.push(null);
    for (let d = 1; d <= daysInMonth; d++) cells.push(new Date(year, month, d));
    return cells;
  }, [cursor, event]);

  // Days of the shown month with a free time, worked out once per change of data rather than
  // on every render (typing in the form re-renders the page)
  const openDays = useMemo(() => {
    const open = new Set();
    if (!event) return open;
    for (const date of monthDays) {
      if (!date || isPastDate(date, today) || !isWithinMaxFuture(date, bookingWindowDays(event), today)) continue;
      if (generateSlots(date, event, rules, exceptions, busyTimes, hostTz, guestTz).length) open.add(date.getTime());
    }
    return open;
  }, [monthDays, event, rules, exceptions, busyTimes, hostTz, guestTz, todayKey]);
  const dayHasSlots = (date) => openDays.has(date.getTime());

  // The first day from today with a free time, looking to the end of the booking window (or a
  // year for events with their own end). null: nothing left to book.
  const nextOpen = useMemo(() => {
    if (!event || loading) return null;
    const days = bookingWindowDays(event) ?? 366;
    for (let i = 0; i <= days; i++) {
      const date = new Date(today.getFullYear(), today.getMonth(), today.getDate() + i);
      if (generateSlots(date, event, rules, exceptions, busyTimes, hostTz, guestTz).length) return date;
    }
    return null;
  }, [event, loading, rules, exceptions, busyTimes, hostTz, guestTz, todayKey]);

  // open on the month of the first free day (an event with later dates, or a full month)
  // a link with ?at=<time> (from the host's "Find a time") opens on that time's day in the
  // guest's zone instead
  const jumped = useRef(false);
  useEffect(() => {
    if (!nextOpen || jumped.current) return;
    jumped.current = true;
    const at = Date.parse(new URLSearchParams(window.location.search).get('at') || '');
    const linked = Number.isNaN(at) ? null : dateInZone(at, guestTz);
    if (linked && linked >= nextOpen && isWithinMaxFuture(linked, bookingWindowDays(event), today)
      && generateSlots(linked, event, rules, exceptions, busyTimes, hostTz, guestTz).length) {
      setCursor(new Date(linked.getFullYear(), linked.getMonth(), 1));
      setSelectedDate(linked);
      return;
    }
    setCursor(new Date(nextOpen.getFullYear(), nextOpen.getMonth(), 1));
  }, [nextOpen]);

  const confirm = async (e) => {
    e?.preventDefault();
    // name the first field that needs attention and move to it
    const fail = (message, id) => { setError(message); if (id) document.getElementById(id)?.focus(); };
    if (!form.guest_name.trim()) return fail('Enter your name.', 'g-name');
    if (emailRequired && !form.guest_email.trim()) return fail('Enter your email.', 'g-email');
    if (form.guest_email.trim() && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(form.guest_email.trim())) return fail('That email address doesn’t look right.', 'g-email');
    if (!form.guest_phone.trim()) return fail('Enter your WhatsApp number.', 'g-phone');
    // the host reaches the guest on WhatsApp, so the number has to be dialable; outside the
    // zones we know a dial code for, it must start with the country code
    const phone = withDialCode(form.guest_phone, dialCode);
    if (!/^\+?\d{7,15}$/.test(normalizePhone(phone)) || (!dialCode && !phone.startsWith('+'))) {
      return fail(`Enter your WhatsApp number with the country code, e.g. ${phoneExample}.`, 'g-phone');
    }
    if (!selectedSlot) return;
    // Validate required custom questions
    if (event?.custom_questions) {
      for (let qi = 0; qi < event.custom_questions.length; qi++) {
        if (event.custom_questions[qi].required && !String(customAnswers[qi] || '').trim()) {
          return fail(`Please answer “${event.custom_questions[qi].text}”.`, `q-${qi}`);
        }
      }
    }
    // one booking per click, however fast the button is pressed again
    if (submittingRef.current) return;
    submittingRef.current = true;
    setSubmitting(true);
    setError('');
    // the time went (taken, full, or no longer bookable): back to the times, freshly loaded
    const timeGone = (message) => {
      setError(message);
      setSlotGone(true);
      backToTimes(); // the message shows above the times
      api.entities.BookedSlot.filter({ host_id: event.created_by_id, status: 'confirmed' })
        .then(setBookedSlots).catch(() => { /* the times shown stay as they were */ });
    };
    try {
      const start = selectedSlot.date.toISOString();
      // the booking ends when the meeting does; buffers only keep neighbouring bookings away
      const end = new Date(selectedSlot.date.getTime() + (event.duration || 30) * 60000);
      // Re-check with the same rules that built the list, as of now: in the past or inside the
      // notice period, past the booking window, or clashing with a time known to be busy. A
      // booking someone else just made is caught by the database, which also stops two guests
      // taking the same time at once.
      const stillFree = isWithinMaxFuture(selectedDate, bookingWindowDays(event), today)
        && generateSlots(selectedDate, event, rules, exceptions, busyTimes, hostTz, guestTz)
          .some((x) => x.date.getTime() === selectedSlot.date.getTime());
      if (!stillFree) {
        timeGone(isGroup ? 'Sorry, that time just filled up or is no longer available. Please pick another.' : 'Sorry, that time is no longer available. Please pick another.');
        setSubmitting(false);
        submittingRef.current = false;
        return;
      }

      const requiresApproval = event.requires_approval || false;
      const booking = await api.bookings.createAsGuest({
        event_type_id: event.id,
        event_name: event.name,
        host_id: event.created_by_id,
        guest_name: form.guest_name.trim(),
        guest_email: form.guest_email.trim() || null,
        guest_phone: phone,
        guest_notes: form.guest_notes.trim(),
        start_time: start,
        end_time: end.toISOString(),
        timezone: hostTz,
        meeting_url: event.meeting_url || '',
        status: 'confirmed',
        approval_status: requiresApproval ? 'pending' : 'approved',
        custom_answers: event.custom_questions ? event.custom_questions.map((q, qi) => ({ question: q.text, answer: customAnswers[qi] || '' })) : [],
        attendee_count: 1,
      });
      // copy it to the host's Google Calendar if they connected one (never holds up the guest)
      if (!requiresApproval) api.google.pushBooking(booking.id);
      // the meeting link is private until booked; ask for it now (null while awaiting approval).
      // The booking is made by now, so a failure here must not read as a failed booking.
      const link = await api.bookings.meetingLink(booking.id).catch(() => undefined);
      if (link !== undefined) booking.meeting_url = link || '';
      // bookPath: this page's own link (it may be a private one), for "pick another time"
      const state = { booking, event, host: { full_name: event.host_name, profile_photo: event.host_photo }, bookPath: `/book/${eventTypeId}`, guestTz };
      // kept for this tab so the confirmation survives a refresh (guests can't read bookings back)
      try { sessionStorage.setItem(`gm-booking-${booking.id}`, JSON.stringify(state)); } catch { /* storage unavailable */ }
      navigate(`/confirm/${booking.id}${embed ? window.location.search : ''}`, { state, replace: true });
      return; // leaving the page; the button stays disabled until it does
    } catch (e) {
      // the database's own booking checks speak to guests; anything else stays generic
      const message = e?.message || '';
      if (/^(Sorry, that time|That time can no longer)/.test(message)) timeGone(message);
      else if (/^(This event is not taking|Too many bookings)/.test(message)) setError(message);
      else {
        setError(/fetch|network/i.test(message)
          ? 'We couldn’t reach GlassMeet. Check your connection and try again; your details are kept.'
          : 'Something went wrong. Your details are kept; please try again.');
      }
    }
    submittingRef.current = false;
    setSubmitting(false);
  };

  if (loading) return (
    <div className="min-h-screen flex items-center justify-center"><Spinner className="w-8 h-8" /></div>
  );
  if (error && !event) return (
    <div className="min-h-screen flex flex-col items-center justify-center gap-3 px-4 text-center">
      <div className="w-14 h-14 rounded-full bg-primary-soft flex items-center justify-center"><Calendar className="w-6 h-6 text-link" /></div>
      <h1 className="text-xl font-bold">Booking page unavailable</h1>
      <p className="text-sm text-muted-foreground">{error}</p>
      {loadFailed && (
        <button type="button" onClick={() => { setError(''); setLoading(true); load(); }} className="mt-2 h-10 px-5 rounded-full bg-primary text-primary-foreground text-sm font-semibold transition-all duration-200 hover:brightness-110">Try again</button>
      )}
    </div>
  );

  const pickedDateLabel = selectedDate?.toLocaleDateString('en-US', { weekday: 'long', month: 'long', day: 'numeric' });
  const monthLabel = cursor.toLocaleDateString('en-US', { month: 'long', year: 'numeric' });
  const now = today;
  const atCurrentMonth = cursor.getFullYear() === now.getFullYear() && cursor.getMonth() === now.getMonth();
  // the host's last day can reach into the next day for a guest ahead of them
  const lastDay = lastBookableDay(event, today);
  if (lastDay) lastDay.setDate(lastDay.getDate() + 1);
  const atLastMonth = lastDay && (cursor.getFullYear() * 12 + cursor.getMonth() >= lastDay.getFullYear() * 12 + lastDay.getMonth());
  const shiftMonth = (n) => { const d = new Date(cursor); d.setDate(1); d.setMonth(d.getMonth() + n); setCursor(d); };
  const wide = !selectedSlot && selectedDate;
  const evText = 'color-mix(in oklab, var(--ev) 72%, var(--foreground))';

  return (
    <div
      className={embed ? 'sm:p-2' : 'min-h-screen bg-background sm:px-4 sm:py-10 lg:py-16'}
      style={{ ['--accent-color']: hexToHsl(color), ['--ev']: color, ['--ev-fg']: readableOn(color) }}
    >
      <div
        className={`relative mx-auto overflow-hidden bg-card sm:rounded-xl sm:border sm:border-border sm:shadow-card transition-[max-width] duration-300 ease-out animate-fade-in
          ${wide ? 'max-w-[1060px]' : 'max-w-[860px]'}`}
      >
        <a href={appPath('/')} {...outLink} className="absolute right-0 top-0 z-10 hidden sm:block w-28 h-28 overflow-hidden" aria-label="Powered by GlassMeet">
          <span className="absolute right-[-36px] top-[22px] w-[150px] rotate-45 bg-foreground py-1 text-center text-[9px] font-bold leading-tight text-background">
            POWERED BY<br />GLASSMEET
          </span>
        </a>

        <div className={`grid md:min-h-[620px] ${wide ? 'md:grid-cols-[320px_1fr] lg:grid-cols-[320px_1fr_270px]' : 'md:grid-cols-[340px_1fr]'}`}>
          {/* Event details */}
          <section className="border-b md:border-b-0 md:border-r border-border p-6 sm:p-8">
            {selectedSlot && (
              <button
                onClick={backToTimes}
                aria-label="Back to times"
                className="mb-6 w-11 h-11 rounded-full border border-border text-link flex items-center justify-center transition-all duration-200 hover:bg-primary-soft"
              >
                <ArrowLeft className="w-5 h-5" />
              </button>
            )}
            <div className="flex items-center gap-3 mb-3">
              <div className="w-10 h-10 rounded-full overflow-hidden bg-primary-soft text-link flex items-center justify-center font-bold">
                {event.host_photo ? <img src={event.host_photo} alt="" className="w-full h-full object-cover" /> : (event.host_name || '?')[0]}
              </div>
              <div className="text-[15px] font-semibold text-muted-foreground">{event.host_name || 'Host'}</div>
            </div>
            <h1 className="text-[26px] sm:text-[28px] font-bold leading-tight mb-6">{event.name}</h1>

            <ul className="space-y-4 text-[15px] font-semibold text-muted-foreground">
              <li className="flex items-start gap-3"><Clock className="w-5 h-5 mt-0.5 shrink-0" /> {event.duration} min</li>
              {event.address ? (
                <li className="flex items-start gap-3"><MapPin className="w-5 h-5 mt-0.5 shrink-0" /> <span>In person<span className="block font-normal whitespace-pre-line">{event.address}</span></span></li>
              ) : (
                <li className="flex items-start gap-3">
                  {/phone|whatsapp/i.test(event.location || '') ? <Phone className="w-5 h-5 mt-0.5 shrink-0" /> : /in person/i.test(event.location || '') ? <MapPin className="w-5 h-5 mt-0.5 shrink-0" /> : <Video className="w-5 h-5 mt-0.5 shrink-0" />}
                  {event.location || 'Meeting details provided upon confirmation'}
                </li>
              )}
              {selectedSlot && (
                <>
                  <li className="flex items-start gap-3"><Calendar className="w-5 h-5 mt-0.5 shrink-0" /> {selectedSlot.label}, {formatMeetingDate(selectedSlot.date, guestTz)}</li>
                  <li className="flex items-start gap-3"><Globe className="w-5 h-5 mt-0.5 shrink-0" /> {guestTz}</li>
                </>
              )}
              {isGroup && <li className="flex items-start gap-3"><Users className="w-5 h-5 mt-0.5 shrink-0" /> Up to {maxAttendees} guests per time{selectedSlot ? ` · ${spotsLeftAt(selectedSlot.date)} spots left` : ''}</li>}
              {event?.price > 0 && <li className="flex items-start gap-3"><CreditCard className="w-5 h-5 mt-0.5 shrink-0" /> {event.price} {event.currency || 'USD'}</li>}
              {event?.requires_approval && <li className="flex items-start gap-3"><Clock3 className="w-5 h-5 mt-0.5 shrink-0" /> The host approves each request</li>}
              <li className="flex items-start gap-3"><MessageCircle className="w-5 h-5 mt-0.5 shrink-0" /> Confirmed on WhatsApp</li>
            </ul>

            {event.description && (
              <>
                <p className={`mt-6 text-[15px] leading-relaxed text-foreground whitespace-pre-line ${showMore ? '' : 'max-md:line-clamp-3'}`}>{event.description}</p>
                {event.description.length > 140 && (
                  <button type="button" onClick={() => setShowMore((v) => !v)} className="md:hidden mt-2 h-10 text-sm font-semibold text-link hover:underline">{showMore ? 'Show less' : 'Show more'}</button>
                )}
              </>
            )}

            <button ref={qrBtnRef} onClick={() => setShowQR(true)} className="mt-8 text-sm font-semibold text-link hidden md:flex items-center gap-1.5 hover:underline">
              <QrCode className="w-4 h-4" /> Show QR code
            </button>
          </section>

          {!selectedSlot ? (
            <>
              {/* Calendar */}
              <section className="p-6 sm:p-8">
                <h2 className="text-xl font-bold mb-6">Select a date and time</h2>

                <div className="max-w-[420px] mx-auto">
                  <div className="flex items-center justify-center gap-6 mb-6">
                    <button
                      onClick={() => shiftMonth(-1)}
                      disabled={atCurrentMonth}
                      aria-label="Previous month"
                      className="w-10 h-10 rounded-full flex items-center justify-center text-link bg-primary-soft transition-all duration-200 hover:brightness-95 disabled:bg-transparent disabled:text-hint disabled:cursor-not-allowed"
                    >
                      <ChevronLeft className="w-5 h-5" />
                    </button>
                    <div className="w-40 text-center text-[15px] font-semibold">{monthLabel}</div>
                    <button
                      onClick={() => shiftMonth(1)}
                      disabled={!!atLastMonth}
                      aria-label="Next month"
                      className="w-10 h-10 rounded-full flex items-center justify-center text-link bg-primary-soft transition-all duration-200 hover:brightness-95 disabled:bg-transparent disabled:text-hint disabled:cursor-not-allowed"
                    >
                      <ChevronRight className="w-5 h-5" />
                    </button>
                  </div>

                  <div className="grid grid-cols-7 mb-2">
                    {['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'].map((d) => (
                      <div key={d} className="text-center text-[11px] font-semibold text-muted-foreground py-1">{d}</div>
                    ))}
                  </div>
                  <div className="grid grid-cols-7 gap-y-1.5">
                    {monthDays.map((date, i) => {
                      if (!date) return <div key={i} />;
                      const has = dayHasSlots(date);
                      const isSel = selectedDate && date.toDateString() === selectedDate.toDateString();
                      const isToday = date.toDateString() === now.toDateString();
                      return (
                        <div key={i} className="flex items-center justify-center">
                          <button
                            disabled={!has}
                            onClick={() => { setSelectedDate(date); setPendingSlot(null); }}
                            aria-pressed={!!isSel}
                            aria-label={date.toLocaleDateString('en-US', { weekday: 'long', month: 'long', day: 'numeric' })}
                            className={`relative w-11 h-11 rounded-full text-[15px] tabular flex items-center justify-center transition-all duration-200
                              ${isSel || has ? 'font-bold' : 'text-hint cursor-default'} ${has && !isSel ? 'hover:brightness-95' : ''}`}
                            style={isSel
                              ? { background: 'var(--ev)', color: 'var(--ev-fg)' }
                              : has ? { background: 'color-mix(in srgb, var(--ev) 12%, transparent)', color: evText } : undefined}
                          >
                            {date.getDate()}
                            {isToday && <span className="absolute bottom-1.5 w-1 h-1 rounded-full" style={{ background: isSel ? 'var(--ev-fg)' : 'currentColor' }} />}
                          </button>
                        </div>
                      );
                    })}
                  </div>

                  {!nextOpen ? (
                    <p role="status" className="mt-6 rounded-lg bg-secondary px-4 py-3 text-center text-sm text-muted-foreground">
                      There are no times left to book for this event. Contact {event.host_name || 'the host'} to find another time.
                    </p>
                  ) : openDays.size === 0 && (
                    <button
                      type="button"
                      onClick={() => { setCursor(new Date(nextOpen.getFullYear(), nextOpen.getMonth(), 1)); setSelectedDate(nextOpen); setPendingSlot(null); }}
                      className="mx-auto mt-6 flex h-10 items-center gap-1.5 rounded-full px-5 text-sm font-semibold transition-all duration-200 hover:brightness-95"
                      style={{ background: 'color-mix(in srgb, var(--ev) 12%, transparent)', color: evText }}
                    >
                      Next available: {nextOpen.toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric' })} <ChevronRight className="w-4 h-4" />
                    </button>
                  )}

                  <div className="mt-8">
                    <label htmlFor="guest-tz" className="block text-[15px] font-bold mb-2">Time zone</label>
                    <div className="relative">
                      <Globe className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" aria-hidden="true" />
                      <GlassSelect id="guest-tz" value={guestTz} onChange={(e) => { setGuestTz(e.target.value); setPendingSlot(null); }} className="pl-9">
                        {tzOptions.map((tz) => <option key={tz} value={tz}>{tz.replace(/_/g, ' ')}</option>)}
                      </GlassSelect>
                    </div>
                  </div>
                </div>
              </section>

              {/* Time slots */}
              {selectedDate && (
                <section ref={slotsRef} className="scroll-mt-4 border-t border-border lg:border-t-0 md:col-span-2 lg:col-span-1 px-6 sm:px-8 lg:pl-0 lg:pr-8 pb-8 pt-6 lg:pt-[88px] animate-slide-in-right">
                  <h3 className="text-[15px] font-semibold mb-5">{pickedDateLabel}</h3>
                  {slotGone && error && <p role="alert" className="mb-4 text-sm text-destructive">{error}</p>}
                  {slots.length === 0 ? (
                    <p className="text-sm text-muted-foreground py-6">No times left on this day. Pick another date.</p>
                  ) : (
                    <div className="grid sm:grid-cols-2 lg:grid-cols-1 gap-2.5 lg:max-h-[440px] lg:overflow-y-auto lg:pr-1">
                      {slots.map((s, i) => (pendingSlot === i ? (
                        <div key={s.date.getTime()} className="grid grid-cols-2 gap-2 animate-fade-in">
                          <div className="h-[52px] rounded-lg bg-muted-foreground text-background text-[15px] font-bold flex items-center justify-center tabular" aria-hidden="true">{s.label}</div>
                          <button
                            ref={nextRef}
                            onClick={() => chooseSlot(s)}
                            aria-label={`Next: book ${s.label}`}
                            className="h-[52px] rounded-lg text-[15px] font-bold transition-all duration-200 hover:brightness-110"
                            style={{ background: 'var(--ev)', color: 'var(--ev-fg)' }}
                          >
                            Next
                          </button>
                        </div>
                      ) : (
                        <button
                          key={s.date.getTime()}
                          data-slot-time={s.date.getTime()}
                          onClick={() => setPendingSlot(i)}
                          className="w-full h-[52px] rounded-lg border bg-card text-[15px] font-bold tabular transition-all duration-200 hover:shadow-[inset_0_0_0_1px_var(--ev)] flex flex-col items-center justify-center leading-tight"
                          style={{ borderColor: 'color-mix(in srgb, var(--ev) 55%, transparent)', color: evText }}
                        >
                          {s.label}
                          {isGroup && <span className="text-[11px] font-semibold">{spotsLeftAt(s.date)} {spotsLeftAt(s.date) === 1 ? 'spot' : 'spots'} left</span>}
                        </button>
                      )))}
                    </div>
                  )}
                </section>
              )}
            </>
          ) : (
            // Details form
            <section ref={formRef} className="scroll-mt-4 p-6 sm:p-8 animate-slide-in-right">
              <h2 className="text-xl font-bold">Enter details</h2>
              <p className="mt-1 mb-6 text-sm text-muted-foreground">
                {formatMeetingDate(selectedSlot.date, guestTz)} · {selectedSlot.label} ·{' '}
                <button type="button" onClick={backToTimes} className="font-semibold text-link hover:underline">Change</button>
              </p>
              <form onSubmit={confirm} noValidate className="max-w-[440px] space-y-5">
                {autofilled && (
                  <div className="flex items-center justify-between gap-3 rounded-lg bg-secondary px-3.5 py-2.5 text-sm" role="status">
                    <span className="min-w-0 text-muted-foreground">Filled in from your GlassMeet account{user?.email ? <> (<span className="text-foreground">{user.email}</span>)</> : ''}.</span>
                    <button type="button" onClick={clearAutofill} className="shrink-0 font-semibold text-link hover:underline">Not you?</button>
                  </div>
                )}
                <div>
                  <GlassLabel htmlFor="g-name">Name *</GlassLabel>
                  <GlassInput id="g-name" autoComplete="name" enterKeyHint="next" maxLength={LIMITS.name} value={form.guest_name} onChange={(e)=>setForm({...form, guest_name: onlyName(e.target.value)})} />
                </div>
                <div>
                  <GlassLabel htmlFor="g-email">{emailRequired ? 'Email *' : 'Email (optional)'}</GlassLabel>
                  <GlassInput id="g-email" type="email" autoComplete="email" maxLength={LIMITS.email} value={form.guest_email} onChange={(e)=>setForm({...form, guest_email: onlyEmail(e.target.value)})} />
                </div>
                <div>
                  <GlassLabel htmlFor="g-phone">WhatsApp number *</GlassLabel>
                  <GlassInput id="g-phone" type="tel" autoComplete="tel" inputMode="tel" maxLength={LIMITS.phone} value={form.guest_phone} onChange={(e)=>setForm({...form, guest_phone: onlyPhone(e.target.value)})} placeholder={phoneExample} />
                  <p className="mt-1.5 text-xs text-muted-foreground">The host confirms your meeting on WhatsApp.{dialCode ? ` Numbers without a country code get +${dialCode}.` : ' Start with your country code.'}</p>
                </div>
                <div>
                  <GlassLabel htmlFor="g-notes" className="leading-snug">Please share anything that will help prepare for our meeting.</GlassLabel>
                  <GlassTextarea id="g-notes" rows={3} maxLength={2000} value={form.guest_notes} onChange={(e)=>setForm({...form, guest_notes: e.target.value})} />
                </div>

                {/* Custom questions */}
                {event?.custom_questions?.length > 0 && event.custom_questions.map((q, qi) => (
                  <div key={qi}>
                    {q.type === 'multiple_choice'
                      ? <div id={`q-${qi}-label`} className="mb-1.5 text-sm font-semibold leading-snug">{q.text}{q.required && ' *'}</div>
                      : <GlassLabel htmlFor={`q-${qi}`} className="leading-snug">{q.text}{q.required && ' *'}</GlassLabel>}
                    {q.type === 'long_text' ? (
                      <GlassTextarea id={`q-${qi}`} rows={2} maxLength={LIMITS.note} value={customAnswers[qi] || ''} onChange={(e)=>setCustomAnswers({...customAnswers, [qi]: e.target.value})} />
                    ) : q.type === 'dropdown' ? (
                      <GlassSelect id={`q-${qi}`} value={customAnswers[qi] || ''} onChange={(e)=>setCustomAnswers({...customAnswers, [qi]: e.target.value})}>
                        <option value="">Select…</option>
                        {(q.options || []).map((opt, oi) => <option key={oi} value={opt}>{opt}</option>)}
                      </GlassSelect>
                    ) : q.type === 'multiple_choice' ? (
                      <div role="radiogroup" aria-labelledby={`q-${qi}-label`} className="space-y-2.5">
                        {(q.options || []).map((opt, oi) => (
                          <label key={oi} className="flex min-h-11 items-center gap-3 rounded-lg border border-border px-3 cursor-pointer text-[15px]">
                            <input type="radio" id={oi === 0 ? `q-${qi}` : undefined} name={`q-${qi}`} checked={customAnswers[qi] === opt} onChange={()=>setCustomAnswers({...customAnswers, [qi]: opt})} className="w-4 h-4" style={{ accentColor: 'var(--ev)' }} />
                            {opt}
                          </label>
                        ))}
                      </div>
                    ) : (
                      <GlassInput id={`q-${qi}`} maxLength={LIMITS.answer} value={customAnswers[qi] || ''} onChange={(e)=>setCustomAnswers({...customAnswers, [qi]: e.target.value})} />
                    )}
                  </div>
                ))}

                <p className="text-xs leading-relaxed text-muted-foreground">
                  Your details are shared with the host. By proceeding, you agree to GlassMeet&rsquo;s{' '}
                  <Link to="/terms" {...outLink} className="font-semibold text-link hover:underline">Terms of Service</Link> and{' '}
                  <Link to="/privacy" {...outLink} className="font-semibold text-link hover:underline">Privacy Policy</Link>.
                </p>
                {error && (
                  <p role="alert" className="text-sm text-destructive">
                    {error}
                    {slotGone && <> <button type="button" onClick={backToTimes} className="font-semibold text-link hover:underline">See available times</button></>}
                  </p>
                )}
                <button
                  type="submit"
                  disabled={submitting}
                  className="h-11 px-6 rounded-full text-[15px] font-bold inline-flex items-center gap-2 transition-all duration-200 hover:brightness-110 disabled:opacity-60"
                  style={{ background: 'var(--ev)', color: 'var(--ev-fg)' }}
                >
                  {submitting ? <><Loader2 className="w-4 h-4 animate-spin" /> Scheduling…</> : event?.requires_approval ? 'Request booking' : 'Schedule event'}
                </button>
              </form>
            </section>
          )}
        </div>
      </div>

      {showQR && <Suspense fallback={null}><QRCodeModal url={bookingUrl} open={showQR} onClose={closeQR} /></Suspense>}
    </div>
  );
}

// Country dial codes for the guest's time zone: a local number ("050 123 4567") gets the code
const DIAL_CODES = {
  'Asia/Dubai': '971', 'Asia/Riyadh': '966', 'Asia/Qatar': '974', 'Asia/Kuwait': '965', 'Asia/Bahrain': '973',
  'Asia/Muscat': '968', 'Asia/Amman': '962', 'Asia/Beirut': '961', 'Africa/Cairo': '20', 'Asia/Kolkata': '91',
  'Asia/Calcutta': '91', 'Asia/Karachi': '92', 'Asia/Dhaka': '880', 'Asia/Manila': '63', 'Europe/London': '44',
  'Africa/Lagos': '234', 'Africa/Nairobi': '254', 'Africa/Johannesburg': '27', 'America/Sao_Paulo': '55', 'America/Mexico_City': '52',
};
const PHONE_EXAMPLES = { 971: '+971 50 123 4567', 966: '+966 50 123 4567', 91: '+91 98765 43210', 44: '+44 7700 900123' };
const withDialCode = (raw, code) => {
  const v = (raw || '').trim();
  if (!code || /^(\+|00)/.test(v)) return v.replace(/^00/, '+');
  return `+${code}${v.replace(/^0+/, '')}`;
};

// last day guests may book: the booking window, the event's end date or its last listed date
function lastBookableDay(event, today = new Date()) {
  if (!event) return null;
  if (event.schedule === 'dates') { const last = [...(event.dates || [])].sort().pop(); return last ? new Date(`${last}T00:00`) : null; }
  if (event.end_date) return new Date(`${event.end_date}T00:00`);
  const days = bookingWindowDays(event);
  if (!days) return null;
  const d = new Date(today); d.setDate(d.getDate() + days); return d;
}

// Navy or white text, whichever reads on the event colour
function readableOn(hex) {
  const h = (hex || '#2b7a75').replace('#', '');
  const [r, g, b] = [0, 2, 4].map((i) => {
    const c = parseInt(h.substring(i, i + 2), 16) / 255;
    return c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4;
  });
  const L = 0.2126 * r + 0.7152 * g + 0.0722 * b;
  return L > 0.3 ? '#344248' : '#ffffff';
}

function hexToHsl(hex) {
  hex = hex.replace('#','');
  const r = parseInt(hex.substring(0,2),16)/255;
  const g = parseInt(hex.substring(2,4),16)/255;
  const b = parseInt(hex.substring(4,6),16)/255;
  const max = Math.max(r,g,b), min = Math.min(r,g,b);
  let h=0,s=0; const l=(max+min)/2;
  if (max!==min){ const d=max-min; s=l>0.5?d/(2-max-min):d/(max+min);
    switch(max){case r:h=(g-b)/d+(g<b?6:0);break;case g:h=(b-r)/d+2;break;case b:h=(r-g)/d+4;break;} h/=6; }
  return `${Math.round(h*360)} ${Math.round(s*100)}% ${Math.round(l*100)}%`;
}
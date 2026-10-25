import React, { useEffect, useState, useMemo, useRef } from 'react';
import { Link, useParams, useNavigate } from 'react-router-dom';
import { api } from '@/lib/localApi';
import {
  Clock, Calendar, Globe, ChevronLeft, ChevronRight, ArrowLeft, Loader2, Video, MessageCircle,
  Users, QrCode, Clock3, CreditCard, MapPin, Phone,
} from 'lucide-react';
import { GlassInput, GlassTextarea, GlassLabel, GlassSelect, Spinner } from '@/components/glass';
import {
  generateSlots, isPastDate, isWithinMaxFuture, detectTimezone,
} from '@/lib/Availability.js';
import { formatMeetingDate, normalizePhone } from '@/lib/whatsapp';
import { getDevice } from '@/lib/devicedetect.js';
import QRCodeModal from '@/components/QrcodeModal.jsx';
import { appPath } from '@/lib/authReturnTo';
import { isEmbed, useEmbedResize } from '@/lib/embed.js';

export default function BookingPage() {
  const { eventTypeId } = useParams();
  const navigate = useNavigate();
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
  const [form, setForm] = useState({ guest_name: '', guest_email: '', guest_phone: '', guest_notes: '' });
  const [customAnswers, setCustomAnswers] = useState({});
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState('');
  const [showQR, setShowQR] = useState(false);

  const device = getDevice();
  const bookingUrl = `${window.location.origin}${appPath(`/book/${eventTypeId}`)}`;

  // Group meeting: count existing bookings for this event
  // Group events: several guests can take the same time. Bookings of this event at the same
  // start only block that time once it is full; everything else blocks as usual.
  const maxAttendees = event?.max_attendees || 1;
  const isGroup = event?.booking_type === 'group' && maxAttendees > 1;
  const sameStart = (b, ms) => b.event_type_id === event?.id && new Date(b.start_time).getTime() === ms;
  const spotsLeftAt = (date) => Math.max(0, maxAttendees - bookedSlots.filter((b) => sameStart(b, date.getTime())).length);

  const guestTz = detectTimezone();
  // weekly hours are in the host's zone; everything the guest sees is in the guest's zone
  const hostTz = event?.host_timezone || guestTz;
  const emailRequired = event?.email_required ?? true;

  useEffect(() => {
    if (!event) return;
    const timeMin = new Date(cursor.getFullYear(), cursor.getMonth(), 1).toISOString();
    const timeMax = new Date(cursor.getFullYear(), cursor.getMonth() + 1, 1).toISOString();
    // Google Calendar busy times are optional (connections are "coming soon"); without them,
    // slots come from the host's availability and GlassMeet bookings.
    api.google.busy(event.created_by_id, timeMin, timeMax)
      .then((busy) => setGoogleBusy(Array.isArray(busy) ? busy : []))
      .catch(() => setGoogleBusy([]));
  }, [event, cursor]);

  useEffect(() => { load(); }, []);

  const load = async () => {
    try {
      const ev = await api.entities.EventType.get(eventTypeId);
      // a switched-off event can't be booked; say so up front rather than at the last click
      if (ev.active === false) { setError('This event isn’t taking bookings right now.'); setLoading(false); return; }
      setEvent(ev);
      const hostId = ev.created_by_id;
      const [r, e, b] = await Promise.all([
        api.entities.AvailabilityRule.filter({ created_by_id: hostId }),
        api.entities.AvailabilityException.filter({ created_by_id: hostId }),
        api.entities.BookedSlot.filter({ host_id: hostId, status: 'confirmed' }),
      ]);
      setRules(r);
      setExceptions(e);
      setBookedSlots(b);
    } catch (err) {
      setError('This booking page could not be found.');
    }
    setLoading(false);
  };

  // generate slots when a date is selected
  useEffect(() => {
    if (!selectedDate || !event) { setSlots([]); return; }
    const s = generateSlots(selectedDate, event, rules, exceptions, [...bookedSlots, ...googleBusy], hostTz, guestTz);
    setSlots(s);
    // keep the guest's pick if it's still free (a background refresh shouldn't throw them out)
    setSelectedSlot((cur) => (cur && s.some((x) => x.date.getTime() === cur.date.getTime()) ? cur : null));
    setPendingSlot(null);
  }, [selectedDate, event, rules, exceptions, bookedSlots, googleBusy]);

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

  const dayHasSlots = (date) => {
    if (!event || isPastDate(date) || !isWithinMaxFuture(date, event.max_future_days)) return false;
    const s = generateSlots(date, event, rules, exceptions, [...bookedSlots, ...googleBusy], hostTz, guestTz);
    return s.length > 0;
  };

  const confirm = async () => {
    if (!form.guest_name.trim() || !form.guest_phone.trim() || (emailRequired && !form.guest_email.trim())) {
      setError(emailRequired ? 'Please fill in your name, email and WhatsApp number.' : 'Please fill in your name and WhatsApp number.');
      return;
    }
    // the host reaches the guest on WhatsApp, so the number has to be dialable
    if (!/^\+?\d{7,15}$/.test(normalizePhone(form.guest_phone))) {
      setError('Enter your WhatsApp number with the country code, e.g. +971 50 123 4567.');
      return;
    }
    if (form.guest_email.trim() && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(form.guest_email.trim())) { setError('That email address doesn’t look right.'); return; }
    if (!selectedSlot) return;
    // Validate required custom questions
    if (event?.custom_questions) {
      for (let qi = 0; qi < event.custom_questions.length; qi++) {
        if (event.custom_questions[qi].required && !String(customAnswers[qi] || '').trim()) {
          setError('Please answer all required questions.');
          return;
        }
      }
    }
    setSubmitting(true);
    setError('');
    try {
      const start = selectedSlot.date.toISOString();
      // the booking ends when the meeting does; buffers only keep neighbouring bookings away
      const end = new Date(selectedSlot.date.getTime() + event.duration * 60000);
      // Re-check against fresh bookings with the same rules that built the list: taken, full,
      // now in the past or inside the notice period, or past the booking window.
      const fresh = await api.entities.BookedSlot.filter({ host_id: event.created_by_id, status: 'confirmed' });
      const stillFree = isWithinMaxFuture(selectedDate, event.max_future_days)
        && generateSlots(selectedDate, event, rules, exceptions, [...fresh, ...googleBusy], hostTz, guestTz)
          .some((x) => x.date.getTime() === selectedSlot.date.getTime());
      if (!stillFree) {
        setError(isGroup ? 'Sorry, that time just filled up or is no longer available. Please pick another.' : 'Sorry, that time is no longer available. Please pick another.');
        setBookedSlots(fresh); // refreshes the times shown when they go back
        setSubmitting(false);
        return;
      }

      const requiresApproval = event.requires_approval || false;
      const booking = await api.bookings.createAsGuest({
        event_type_id: event.id,
        event_name: event.name,
        host_id: event.created_by_id,
        guest_name: form.guest_name.trim(),
        guest_email: form.guest_email.trim() || null,
        guest_phone: form.guest_phone.trim(),
        guest_notes: form.guest_notes.trim(),
        start_time: start,
        end_time: end.toISOString(),
        timezone: hostTz,
        meeting_url: event.meeting_url || '',
        status: requiresApproval ? 'confirmed' : 'confirmed',
        approval_status: requiresApproval ? 'pending' : 'approved',
        custom_answers: event.custom_questions ? event.custom_questions.map((q, qi) => ({ question: q.text, answer: customAnswers[qi] || '' })) : [],
        attendee_count: 1,
      });
      const state = { booking, event, host: { full_name: event.host_name, profile_photo: event.host_photo } };
      // kept for this tab so the confirmation survives a refresh (guests can't read bookings back)
      try { sessionStorage.setItem(`gm-booking-${booking.id}`, JSON.stringify(state)); } catch { /* storage unavailable */ }
      navigate(`/confirm/${booking.id}${embed ? window.location.search : ''}`, { state });
    } catch (e) {
      setError('Could not complete booking. ' + (e.message || 'Please try again.'));
    }
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
    </div>
  );

  const pickedDateLabel = selectedDate?.toLocaleDateString('en-US', { weekday: 'long', month: 'long', day: 'numeric' });
  const monthLabel = cursor.toLocaleDateString('en-US', { month: 'long', year: 'numeric' });
  const now = new Date();
  const atCurrentMonth = cursor.getFullYear() === now.getFullYear() && cursor.getMonth() === now.getMonth();
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
                onClick={() => setSelectedSlot(null)}
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

            {event.description && <p className="mt-6 text-[15px] leading-relaxed text-foreground whitespace-pre-line">{event.description}</p>}

            <button onClick={() => setShowQR(true)} className="mt-8 text-sm font-semibold text-link flex items-center gap-1.5 hover:underline">
              <QrCode className="w-4 h-4" /> Show QR code
            </button>
          </section>

          {!selectedSlot ? (
            <>
              {/* Calendar */}
              <section className="p-6 sm:p-8">
                <h2 className="text-xl font-bold mb-6">Select a Date &amp; Time</h2>

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
                      aria-label="Next month"
                      className="w-10 h-10 rounded-full flex items-center justify-center text-link bg-primary-soft transition-all duration-200 hover:brightness-95"
                    >
                      <ChevronRight className="w-5 h-5" />
                    </button>
                  </div>

                  <div className="grid grid-cols-7 mb-2">
                    {['SUN', 'MON', 'TUE', 'WED', 'THU', 'FRI', 'SAT'].map((d) => (
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

                  <div className="mt-8">
                    <div className="text-[15px] font-bold mb-2">Time zone</div>
                    <div className="flex items-center gap-2 text-sm text-muted-foreground"><Globe className="w-4 h-4" /> {guestTz}</div>
                  </div>
                </div>
              </section>

              {/* Time slots */}
              {selectedDate && (
                <section ref={slotsRef} className="scroll-mt-4 border-t border-border lg:border-t-0 md:col-span-2 lg:col-span-1 px-6 sm:px-8 lg:pl-0 lg:pr-8 pb-8 pt-6 lg:pt-[88px] animate-slide-in-right">
                  <h3 className="text-[15px] font-semibold mb-5">{pickedDateLabel}</h3>
                  {slots.length === 0 ? (
                    <p className="text-sm text-muted-foreground py-6">No times left on this day. Pick another date.</p>
                  ) : (
                    <div className="grid sm:grid-cols-2 lg:grid-cols-1 gap-2.5 lg:max-h-[440px] lg:overflow-y-auto lg:pr-1">
                      {slots.map((s, i) => (pendingSlot === i ? (
                        <div key={i} className="grid grid-cols-2 gap-2 animate-fade-in">
                          <div className="h-[52px] rounded-lg bg-muted-foreground text-background text-[15px] font-bold flex items-center justify-center tabular">{s.label}</div>
                          <button
                            onClick={() => { setSelectedSlot(s); setPendingSlot(null); }}
                            className="h-[52px] rounded-lg text-[15px] font-bold transition-all duration-200 hover:brightness-110"
                            style={{ background: 'var(--ev)', color: 'var(--ev-fg)' }}
                          >
                            Next
                          </button>
                        </div>
                      ) : (
                        <button
                          key={i}
                          onClick={() => setPendingSlot(i)}
                          className="w-full h-[52px] rounded-lg border bg-card text-[15px] font-bold tabular transition-all duration-200 hover:shadow-[inset_0_0_0_1px_var(--ev)] flex flex-col items-center justify-center leading-tight"
                          style={{ borderColor: 'color-mix(in srgb, var(--ev) 55%, transparent)', color: evText }}
                        >
                          {s.label}
                          {isGroup && <span className="text-[11px] font-semibold opacity-80">{spotsLeftAt(s.date)} {spotsLeftAt(s.date) === 1 ? 'spot' : 'spots'} left</span>}
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
              <h2 className="text-xl font-bold mb-6">Enter Details</h2>
              <div className="max-w-[440px] space-y-5">
                <div>
                  <GlassLabel htmlFor="g-name">Name *</GlassLabel>
                  <GlassInput id="g-name" autoComplete="name" maxLength={100} value={form.guest_name} onChange={(e)=>setForm({...form, guest_name: e.target.value})} />
                </div>
                <div>
                  <GlassLabel htmlFor="g-email">{emailRequired ? 'Email *' : 'Email (optional)'}</GlassLabel>
                  <GlassInput id="g-email" type="email" autoComplete="email" maxLength={254} value={form.guest_email} onChange={(e)=>setForm({...form, guest_email: e.target.value})} />
                </div>
                <div>
                  <GlassLabel htmlFor="g-phone">WhatsApp number *</GlassLabel>
                  <GlassInput id="g-phone" type="tel" autoComplete="tel" inputMode="tel" maxLength={24} value={form.guest_phone} onChange={(e)=>setForm({...form, guest_phone: e.target.value})} placeholder="+1 555 000 0000" />
                  <p className="mt-1.5 text-xs text-muted-foreground">The host confirms your meeting on WhatsApp.</p>
                </div>
                <div>
                  <GlassLabel htmlFor="g-notes" className="leading-snug">Please share anything that will help prepare for our meeting.</GlassLabel>
                  <GlassTextarea id="g-notes" rows={3} maxLength={2000} value={form.guest_notes} onChange={(e)=>setForm({...form, guest_notes: e.target.value})} />
                </div>

                {/* Custom questions */}
                {event?.custom_questions?.length > 0 && event.custom_questions.map((q, qi) => (
                  <div key={qi}>
                    <GlassLabel className="leading-snug">{q.text}{q.required && ' *'}</GlassLabel>
                    {q.type === 'long_text' ? (
                      <GlassTextarea rows={2} value={customAnswers[qi] || ''} onChange={(e)=>setCustomAnswers({...customAnswers, [qi]: e.target.value})} />
                    ) : q.type === 'dropdown' ? (
                      <GlassSelect value={customAnswers[qi] || ''} onChange={(e)=>setCustomAnswers({...customAnswers, [qi]: e.target.value})}>
                        <option value="">Select…</option>
                        {(q.options || []).map((opt, oi) => <option key={oi} value={opt}>{opt}</option>)}
                      </GlassSelect>
                    ) : q.type === 'multiple_choice' ? (
                      <div className="space-y-2.5">
                        {(q.options || []).map((opt, oi) => (
                          <label key={oi} className="flex items-center gap-3 cursor-pointer text-[15px]">
                            <input type="radio" name={`q-${qi}`} checked={customAnswers[qi] === opt} onChange={()=>setCustomAnswers({...customAnswers, [qi]: opt})} className="w-4 h-4" style={{ accentColor: 'var(--ev)' }} />
                            {opt}
                          </label>
                        ))}
                      </div>
                    ) : (
                      <GlassInput value={customAnswers[qi] || ''} onChange={(e)=>setCustomAnswers({...customAnswers, [qi]: e.target.value})} />
                    )}
                  </div>
                ))}

                <p className="text-xs leading-relaxed text-muted-foreground">
                  Your details are shared with the host. By proceeding, you agree to GlassMeet&rsquo;s{' '}
                  <Link to="/terms" {...outLink} className="font-semibold text-link hover:underline">Terms of Service</Link> and{' '}
                  <Link to="/privacy" {...outLink} className="font-semibold text-link hover:underline">Privacy Policy</Link>.
                </p>
                {error && <p role="alert" className="text-sm text-destructive">{error}</p>}
                <button
                  onClick={confirm}
                  disabled={submitting}
                  className="h-11 px-6 rounded-full text-[15px] font-bold inline-flex items-center gap-2 transition-all duration-200 hover:brightness-110 disabled:opacity-60"
                  style={{ background: 'var(--ev)', color: 'var(--ev-fg)' }}
                >
                  {submitting ? <><Loader2 className="w-4 h-4 animate-spin" /> Scheduling…</> : event?.requires_approval ? 'Request booking' : 'Schedule Event'}
                </button>
              </div>
            </section>
          )}
        </div>
      </div>

      {showQR && <QRCodeModal url={bookingUrl} open={showQR} onClose={() => setShowQR(false)} />}
    </div>
  );
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
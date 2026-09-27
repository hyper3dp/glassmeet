import React, { useEffect, useState, useMemo } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { api } from '@/lib/localApi';
import {
  Clock, Calendar, Globe, ChevronLeft, ChevronRight, ArrowRight, Loader2, Sparkles, Video, MessageCircle, Check,
  Users, QrCode, Clock3,
} from 'lucide-react';
import { GlassButton, GlassInput, GlassTextarea, GlassLabel, GlassSelect, Spinner } from '@/components/glass';
import {
  generateSlots, isPastDate, isWithinMaxFuture, formatDate, detectTimezone,
} from '@/lib/availability';
import { formatMeetingDate, formatMeetingTime } from '@/lib/whatsapp';
import { getDevice } from '@/lib/deviceDetect';
import QRCodeModal from '@/components/QRCodeModal';

export default function BookingPage() {
  const { eventTypeId } = useParams();
  const navigate = useNavigate();
  const [event, setEvent] = useState(null);
  const [rules, setRules] = useState([]);
  const [exceptions, setExceptions] = useState([]);
  const [slots, setSlots] = useState([]);
  const [bookedSlots, setBookedSlots] = useState([]);
  const [googleBusy, setGoogleBusy] = useState([]);
  const [googleBusyError, setGoogleBusyError] = useState('');
  const [loading, setLoading] = useState(true);
  const [cursor, setCursor] = useState(new Date());
  const [selectedDate, setSelectedDate] = useState(null);
  const [selectedSlot, setSelectedSlot] = useState(null);
  const [form, setForm] = useState({ guest_name: '', guest_email: '', guest_phone: '', guest_notes: '' });
  const [customAnswers, setCustomAnswers] = useState({});
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState('');
  const [showQR, setShowQR] = useState(false);

  const device = getDevice();
  const bookingUrl = `${window.location.origin}/book/${eventTypeId}`;

  // Group meeting: count existing bookings for this event
  const groupBookings = bookedSlots.filter((b) => b.event_type_id === eventTypeId && b.status === 'confirmed');
  const maxAttendees = event?.max_attendees || 1;
  const isGroup = event?.booking_type === 'group';
  const spotsRemaining = Math.max(0, maxAttendees - groupBookings.length);
  const isFull = isGroup && spotsRemaining === 0;

  const guestTz = detectTimezone();
  const hostTz = event?.host_timezone || guestTz;

  useEffect(() => {
    if (!event) return;
    const timeMin = new Date(cursor.getFullYear(), cursor.getMonth(), 1).toISOString();
    const timeMax = new Date(cursor.getFullYear(), cursor.getMonth() + 1, 1).toISOString();
    api.google.busy(event.created_by_id, timeMin, timeMax)
      .then((busy) => {
        setGoogleBusy(busy);
        setGoogleBusyError('');
      })
      .catch(() => {
        setGoogleBusy([]);
        setGoogleBusyError('The host calendar could not be checked. Try again later.');
      });
  }, [event, cursor]);

  useEffect(() => { load(); }, []);

  const load = async () => {
    try {
      const ev = await api.entities.EventType.get(eventTypeId);
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
    const s = generateSlots(selectedDate, event, rules, exceptions, [...bookedSlots, ...googleBusy], hostTz);
    setSlots(s);
    setSelectedSlot(null);
  }, [selectedDate, event, rules, exceptions, bookedSlots, googleBusy]);

  const color = event?.color || '#0A84FF';

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
    if (!event || googleBusyError || isPastDate(date) || !isWithinMaxFuture(date, event.max_future_days)) return false;
    const s = generateSlots(date, event, rules, exceptions, [...bookedSlots, ...googleBusy], hostTz);
    return s.length > 0;
  };

  const confirm = async () => {
    if (!form.guest_name || !form.guest_email || !form.guest_phone) { setError('Please fill in your name, email, and WhatsApp number.'); return; }
    if (!selectedSlot) return;
    // Validate required custom questions
    if (event?.custom_questions) {
      for (let qi = 0; qi < event.custom_questions.length; qi++) {
        if (event.custom_questions[qi].required && !customAnswers[qi]) {
          setError('Please answer all required questions.');
          return;
        }
      }
    }
    setSubmitting(true);
    setError('');
    try {
      const start = selectedSlot.date.toISOString();
      const end = new Date(selectedSlot.date.getTime() + (event.duration + (event.buffer_after||0)) * 60000);
      // re-check conflict
      const fresh = await api.entities.BookedSlot.filter({ host_id: event.created_by_id, status: 'confirmed' });
      const conflict = fresh.some((b) => {
        const bs = new Date(b.start_time).getTime();
        const be = new Date(b.end_time).getTime();
        const ns = new Date(start).getTime() - (event.buffer_before||0)*60000;
        const ne = new Date(end).getTime();
        return ns < be && bs < ne;
      });
      if (conflict) { setError('Sorry, that time was just taken. Please pick another.'); setSubmitting(false); return; }

      const requiresApproval = event.requires_approval || false;
      const booking = await api.entities.Booking.create({
        event_type_id: event.id,
        event_name: event.name,
        host_id: event.created_by_id,
        guest_name: form.guest_name,
        guest_email: form.guest_email,
        guest_phone: form.guest_phone,
        guest_notes: form.guest_notes,
        start_time: start,
        end_time: end,
        timezone: hostTz,
        meeting_url: event.meeting_url || '',
        status: requiresApproval ? 'confirmed' : 'confirmed',
        approval_status: requiresApproval ? 'pending' : 'approved',
        custom_answers: event.custom_questions ? event.custom_questions.map((q, qi) => ({ question: q.text, answer: customAnswers[qi] || '' })) : [],
        attendee_count: 1,
      });
      if (!requiresApproval) {
        await api.entities.BookedSlot.create({
          event_type_id: event.id,
          host_id: event.created_by_id,
          start_time: start,
          end_time: end,
          status: 'confirmed',
        });
      }
      navigate(`/confirm/${booking.id}`, { state: { booking, event, host: { full_name: event.host_name, profile_photo: event.host_photo } } });
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
      <div className="w-14 h-14 rounded-2xl glass flex items-center justify-center"><Calendar className="w-7 h-7 text-muted-foreground" /></div>
      <h1 className="text-xl font-semibold">Booking page unavailable</h1>
      <p className="text-sm text-muted-foreground">{error}</p>
    </div>
  );

  return (
    <div className="min-h-screen" style={{ ['--accent-color']: hexToHsl(color) }}>
      <div className="max-w-2xl mx-auto px-4 py-8 sm:py-12">
        {/* Header */}
        <div className="flex items-center gap-2 mb-8">
          <div className="w-8 h-8 rounded-lg accent-bg flex items-center justify-center"><Sparkles className="w-4 h-4 text-white" /></div>
          <span className="font-semibold">GlassMeet</span>
        </div>

        <div className="glass-panel p-6 sm:p-8 animate-fade-in">
          {/* Host */}
          <div className="flex items-center gap-4 mb-6">
            <div className="w-14 h-14 rounded-2xl glass overflow-hidden flex items-center justify-center">
              {event.host_photo ? <img src={event.host_photo} alt="" className="w-full h-full object-cover" /> : <span className="text-lg font-semibold accent-text">{(event.host_name||'?')[0]}</span>}
            </div>
            <div>
              <div className="font-semibold text-lg">{event.host_name || 'Host'}</div>
              <div className="text-sm text-muted-foreground">{event.name}</div>
            </div>
          </div>

          <h1 className="text-2xl font-semibold mb-2">{event.name}</h1>
          {event.description && <p className="text-muted-foreground text-sm mb-5">{event.description}</p>}

          <div className="flex flex-wrap gap-2 mb-6 text-sm">
            <span className="glass rounded-full px-3 py-1.5 flex items-center gap-1.5"><Clock className="w-3.5 h-3.5 accent-text" /> {event.duration} min</span>
            <span className="glass rounded-full px-3 py-1.5 flex items-center gap-1.5"><Video className="w-3.5 h-3.5 accent-text" /> {event.location || 'Meeting'}</span>
            <span className="glass rounded-full px-3 py-1.5 flex items-center gap-1.5"><Globe className="w-3.5 h-3.5 accent-text" /> {hostTz}</span>
            {isGroup && <span className="glass rounded-full px-3 py-1.5 flex items-center gap-1.5"><Users className="w-3.5 h-3.5 accent-text" /> {spotsRemaining} / {maxAttendees} spots</span>}
            {event?.price > 0 && <span className="glass rounded-full px-3 py-1.5 flex items-center gap-1.5 accent-text">${event.price} {event.currency || 'USD'}</span>}
            {event?.requires_approval && <span className="glass rounded-full px-3 py-1.5 flex items-center gap-1.5"><Clock3 className="w-3.5 h-3.5 accent-text" /> Requires approval</span>}
          </div>

          <button onClick={() => setShowQR(true)} className="mb-4 text-xs accent-text flex items-center gap-1.5">
            <QrCode className="w-3.5 h-3.5" /> Show QR code
          </button>

          {!selectedSlot ? (
            <>
              {/* Calendar */}
              <div className="flex items-center justify-between mb-3">
                <h2 className="font-medium">Choose a date</h2>
                <div className="flex gap-1">
                  <button onClick={()=>{ const d=new Date(cursor); d.setMonth(d.getMonth()-1); setCursor(d); }} className="w-8 h-8 rounded-lg glass flex items-center justify-center"><ChevronLeft className="w-4 h-4" /></button>
                  <button onClick={()=>{ const d=new Date(cursor); d.setMonth(d.getMonth()+1); setCursor(d); }} className="w-8 h-8 rounded-lg glass flex items-center justify-center"><ChevronRight className="w-4 h-4" /></button>
                </div>
              </div>
              {googleBusyError && <p role="alert" className="mb-3 text-sm text-destructive">{googleBusyError}</p>}
              <div className="text-center text-sm font-medium mb-3 text-muted-foreground">{cursor.toLocaleDateString('en-US',{month:'long',year:'numeric'})}</div>
              <div className="grid grid-cols-7 mb-2">
                {['S','M','T','W','T','F','S'].map((d,i)=><div key={i} className="text-center text-xs text-muted-foreground py-1">{d}</div>)}
              </div>
              <div className="grid grid-cols-7 gap-1.5">
                {monthDays.map((date, i) => {
                  if (!date) return <div key={i} />;
                  const has = dayHasSlots(date);
                  const isSel = selectedDate && date.toDateString() === selectedDate.toDateString();
                  const today = new Date(); today.setHours(0,0,0,0);
                  const isPast = date < today;
                  return (
                    <button
                      key={i}
                      disabled={!has}
                      onClick={()=>setSelectedDate(date)}
                      className={`aspect-square rounded-xl text-sm font-medium transition flex items-center justify-center
                        ${isSel ? 'accent-bg text-white' : has ? 'glass-button' : 'text-muted-foreground/40 cursor-not-allowed'}
                        ${isPast && !isSel ? 'line-through' : ''}`}
                    >
                      {date.getDate()}
                    </button>
                  );
                })}
              </div>

              {/* Slots */}
              {selectedDate && (
                <div className="mt-6 animate-slide-up">
                  <h2 className="font-medium mb-3">Available times · {selectedDate.toLocaleDateString('en-US',{weekday:'long',month:'long',day:'numeric'})}</h2>
                  {slots.length === 0 ? (
                    <p className="text-sm text-muted-foreground py-6 text-center">No available times this day. Try another date.</p>
                  ) : (
                    <div className="grid grid-cols-2 sm:grid-cols-3 gap-2">
                      {slots.map((s, i) => (
                        <button
                          key={i}
                          onClick={()=>setSelectedSlot(s)}
                          className="glass-button rounded-xl py-3 text-sm font-medium"
                        >
                          {s.label}
                        </button>
                      ))}
                    </div>
                  )}
                </div>
              )}
            </>
          ) : (
            // Form
            <div className="animate-slide-up">
              <button onClick={()=>setSelectedSlot(null)} className="text-sm accent-text flex items-center gap-1 mb-4"><ChevronLeft className="w-3.5 h-3.5" /> Back to times</button>
              <div className="glass rounded-2xl p-4 mb-5">
                <div className="font-medium">{formatMeetingDate(selectedSlot.date, hostTz)}</div>
                <div className="text-sm text-muted-foreground">{selectedSlot.label} · {hostTz}</div>
              </div>
              <div className="space-y-4">
                <div>
                  <GlassLabel>Full name</GlassLabel>
                  <GlassInput value={form.guest_name} onChange={(e)=>setForm({...form, guest_name: e.target.value})} placeholder="Jane Doe" />
                </div>
                <div>
                  <GlassLabel>Email</GlassLabel>
                  <GlassInput type="email" value={form.guest_email} onChange={(e)=>setForm({...form, guest_email: e.target.value})} placeholder="jane@example.com" />
                </div>
                <div>
                  <GlassLabel>WhatsApp number</GlassLabel>
                  <GlassInput value={form.guest_phone} onChange={(e)=>setForm({...form, guest_phone: e.target.value})} placeholder="+1 555 000 0000" />
                </div>
                <div>
                  <GlassLabel>Notes (optional)</GlassLabel>
                  <GlassTextarea rows={3} value={form.guest_notes} onChange={(e)=>setForm({...form, guest_notes: e.target.value})} placeholder="Anything you'd like to share..." />
                </div>

                {/* Custom questions */}
                {event?.custom_questions?.length > 0 && (
                  <div className="space-y-3 pt-2">
                    {event.custom_questions.map((q, qi) => (
                      <div key={qi}>
                        <GlassLabel>{q.text}{q.required && <span className="text-red-500 ml-1">*</span>}</GlassLabel>
                        {q.type === 'long_text' ? (
                          <GlassTextarea rows={2} value={customAnswers[qi] || ''} onChange={(e)=>setCustomAnswers({...customAnswers, [qi]: e.target.value})} placeholder="Your answer..." />
                        ) : q.type === 'dropdown' ? (
                          <GlassSelect value={customAnswers[qi] || ''} onChange={(e)=>setCustomAnswers({...customAnswers, [qi]: e.target.value})}>
                            <option value="">Select…</option>
                            {(q.options || []).map((opt, oi) => <option key={oi} value={opt}>{opt}</option>)}
                          </GlassSelect>
                        ) : q.type === 'multiple_choice' ? (
                          <div className="space-y-1.5">
                            {(q.options || []).map((opt, oi) => (
                              <label key={oi} className="flex items-center gap-2.5 glass rounded-xl px-3 py-2.5 cursor-pointer">
                                <input type="radio" name={`q-${qi}`} checked={customAnswers[qi] === opt} onChange={()=>setCustomAnswers({...customAnswers, [qi]: opt})} className="accent-[hsl(var(--accent-color))]" />
                                <span className="text-sm">{opt}</span>
                              </label>
                            ))}
                          </div>
                        ) : (
                          <GlassInput value={customAnswers[qi] || ''} onChange={(e)=>setCustomAnswers({...customAnswers, [qi]: e.target.value})} placeholder="Your answer..." />
                        )}
                      </div>
                    ))}
                  </div>
                )}
              </div>
              {error && <p className="text-sm text-red-500 mt-3">{error}</p>}
              <GlassButton variant="primary" size="lg" className="w-full mt-5" onClick={confirm} disabled={submitting}>
                {submitting ? <><Loader2 className="w-4 h-4 animate-spin" /> Confirming…</> : isFull ? <>Join Waitlist <ArrowRight className="w-4 h-4" /></> : event?.requires_approval ? <>Request Booking <ArrowRight className="w-4 h-4" /></> : <>Confirm booking <ArrowRight className="w-4 h-4" /></>}
              </GlassButton>
            </div>
          )}
        </div>

        <p className="text-center text-xs text-muted-foreground mt-6">Powered by GlassMeet · Schedule meetings. Stay on WhatsApp.</p>
      </div>

      {showQR && <QRCodeModal url={bookingUrl} open={showQR} onClose={() => setShowQR(false)} />}
    </div>
  );
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
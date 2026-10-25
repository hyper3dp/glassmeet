import React, { useState } from 'react';
import { useLocation, Link } from 'react-router-dom';
import {
  CheckCircle2, Calendar, Globe, Video, MessageCircle, Copy, Check, MapPin,
  CalendarPlus, Download, Users,
} from 'lucide-react';
import { GlassButton } from '@/components/glass';
import { formatMeetingDate, formatMeetingTime, buildWhatsAppLink, fillTemplate, DEFAULT_CONFIRMATION_TEMPLATE } from '@/lib/whatsapp';
import { downloadIcs, openGoogleCalendar, openAppleCalendar, openOutlookCalendar } from '@/lib/calendar';
import { getCalendarPriority } from '@/lib/devicedetect.js';
import { appPath } from '@/lib/authReturnTo';

export default function BookingConfirmation() {
  const location = useLocation();
  const { booking, event, host } = (location.state || {});
  const [copied, setCopied] = useState(false);

  if (!booking) {
    return (
      <div className="min-h-screen flex flex-col items-center justify-center gap-3 px-4 text-center">
        <div className="w-14 h-14 rounded-full bg-primary-soft flex items-center justify-center"><CheckCircle2 className="w-6 h-6 text-link" /></div>
        <h1 className="text-xl font-bold">You're all set</h1>
        <p className="text-sm text-muted-foreground">Your booking went through.</p>
        <Link to="/"><GlassButton variant="primary" size="sm">Back to home</GlassButton></Link>
      </div>
    );
  }

  const tz = booking.timezone || 'UTC';
  const date = formatMeetingDate(booking.start_time, tz);
  const time = formatMeetingTime(booking.start_time, tz);
  const endTime = formatMeetingTime(booking.end_time, tz);
  const hostName = host?.full_name || event?.host_name || 'your host';
  const meetingUrl = booking.meeting_url || event?.meeting_url || '';
  const pending = booking.approval_status === 'pending';

  const waMsg = fillTemplate(DEFAULT_CONFIRMATION_TEMPLATE, {
    guestName: booking.guest_name,
    hostName,
    date, time,
    duration: `${event?.duration || 30} min`,
    meetingUrl,
    timezone: tz,
  });

  const copyLink = () => { navigator.clipboard.writeText(meetingUrl); setCopied(true); setTimeout(()=>setCopied(false),2000); };

  const calendarPriority = getCalendarPriority();

  const calendarButtons = {
    apple: { icon: CalendarPlus, label: 'Apple Calendar', action: () => openAppleCalendar(booking, event, host), primary: true },
    google: { icon: CalendarPlus, label: 'Google Calendar', action: () => openGoogleCalendar(booking, event, host), primary: true },
    outlook: { icon: CalendarPlus, label: 'Outlook', action: () => openOutlookCalendar(booking, event, host), primary: true },
    webcal: { icon: Download, label: 'Download .ics', action: () => downloadIcs(booking, event, host), primary: false },
  };

  const orderedButtons = calendarPriority.map((k) => calendarButtons[k]).filter(Boolean);
  const primaryButtons = orderedButtons.filter((b) => b.primary);
  const secondaryButtons = orderedButtons.filter((b) => !b.primary);

  return (
    <div className="min-h-screen bg-background sm:px-4 sm:py-10 lg:py-16">
      <div className="relative mx-auto max-w-[860px] overflow-hidden bg-card sm:rounded-xl sm:border sm:border-border sm:shadow-card animate-scale-in">
        <a href={appPath('/')} className="absolute right-0 top-0 z-10 hidden sm:block w-28 h-28 overflow-hidden" aria-label="Powered by GlassMeet">
          <span className="absolute right-[-36px] top-[22px] w-[150px] rotate-45 bg-foreground py-1 text-center text-[9px] font-bold leading-tight text-background">
            POWERED BY<br />GLASSMEET
          </span>
        </a>

        <div className="px-6 py-10 sm:px-14 sm:py-14">
          <div className="text-center">
            <div className="mx-auto mb-4 w-12 h-12 rounded-full bg-success text-white flex items-center justify-center">
              <Check className="w-6 h-6" strokeWidth={3} />
            </div>
            <h1 className="text-2xl sm:text-[28px] font-bold">{pending ? 'Request sent' : 'You are scheduled'}</h1>
            <p className="mt-2 text-[15px] text-muted-foreground">
              {pending ? `${hostName} will review your request and reply on WhatsApp.` : `Your meeting with ${hostName} is booked. Confirm it on WhatsApp below.`}
            </p>
          </div>

          {/* Summary */}
          <div className="mx-auto mt-8 max-w-[520px] rounded-xl border border-border p-6">
            <h2 className="text-lg font-bold mb-4">{event?.name || booking.event_name || 'Meeting'}</h2>
            <ul className="space-y-3.5 text-[15px] font-semibold text-muted-foreground">
              <li className="flex items-start gap-3"><Users className="w-5 h-5 mt-0.5 shrink-0" /> {hostName}</li>
              <li className="flex items-start gap-3"><Calendar className="w-5 h-5 mt-0.5 shrink-0" /> {time} – {endTime}, {date}</li>
              <li className="flex items-start gap-3"><Globe className="w-5 h-5 mt-0.5 shrink-0" /> {tz}</li>
              {event?.address ? (
                <li className="flex items-start gap-3"><MapPin className="w-5 h-5 mt-0.5 shrink-0" /> <span className="whitespace-pre-line">{event.address}</span></li>
              ) : (event?.location || meetingUrl) && (
                <li className="flex items-start gap-3"><Video className="w-5 h-5 mt-0.5 shrink-0" /> <span className="break-all">{meetingUrl || event.location}</span></li>
              )}
            </ul>
            {meetingUrl && (
              <button onClick={copyLink} className="mt-4 text-sm font-semibold text-link flex items-center gap-1.5 hover:underline">
                {copied ? <Check className="w-4 h-4" /> : <Copy className="w-4 h-4" />} {copied ? 'Link copied' : 'Copy meeting link'}
              </button>
            )}
          </div>

          {/* Actions */}
          <div className="mx-auto mt-6 max-w-[520px] space-y-3">
            <GlassButton variant="primary" size="lg" className="w-full" type="button" onClick={()=>window.open(buildWhatsAppLink(booking.guest_phone, waMsg), '_blank')}>
              <MessageCircle className="w-4 h-4" /> Open WhatsApp
            </GlassButton>
          </div>

          {/* Add to calendar */}
          <section aria-labelledby="add-to-cal" className="mx-auto mt-6 max-w-[520px] rounded-xl border border-border p-5">
            <h2 id="add-to-cal" className="text-[15px] font-bold flex items-center gap-2">
              <CalendarPlus className="w-4 h-4 text-link" /> Add to your calendar
            </h2>
            <p className="mt-1 text-sm text-muted-foreground">
              {pending ? 'Save the time now; it becomes final once the host approves.' : 'Save this meeting so you get your calendar’s usual reminders.'}
            </p>
            <div className="mt-4 grid gap-2 sm:grid-cols-3">
              {primaryButtons.map((btn) => (
                <GlassButton key={btn.label} size="md" type="button" onClick={btn.action} className="w-full px-3">
                  {btn.label}
                </GlassButton>
              ))}
            </div>
            {secondaryButtons.map((btn) => (
              <button key={btn.label} type="button" onClick={btn.action} className="mt-3 h-8 text-sm font-semibold text-link flex items-center gap-1.5 hover:underline">
                <btn.icon className="w-4 h-4" /> {btn.label} for any other calendar
              </button>
            ))}
          </section>

          <details className="mx-auto mt-8 max-w-[520px] rounded-xl bg-secondary px-5 py-4 group">
            <summary className="cursor-pointer list-none text-sm font-bold flex items-center gap-2">
              <MessageCircle className="w-4 h-4 text-muted-foreground" /> Preview the WhatsApp message
            </summary>
            <pre className="mt-3 text-sm whitespace-pre-wrap font-body text-foreground">{waMsg}</pre>
          </details>

          <p className="mt-8 text-center text-sm text-muted-foreground">Need to change something? Message {hostName} on WhatsApp.</p>
        </div>
      </div>
    </div>
  );
}

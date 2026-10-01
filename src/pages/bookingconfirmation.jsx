import React, { useState } from 'react';
import { useLocation, Link } from 'react-router-dom';
import {
  CheckCircle2, Calendar, Clock, Globe, Video, MessageCircle, Copy, Check,
  CalendarPlus, Apple, Sparkles, Download, Rss, QrCode,
} from 'lucide-react';
import { GlassButton } from '@/components/glass';
import { formatMeetingDate, formatMeetingTime, buildWhatsAppLink, fillTemplate, DEFAULT_CONFIRMATION_TEMPLATE } from '@/lib/whatsapp';
import { downloadIcs, openGoogleCalendar, openAppleCalendar, openOutlookCalendar } from '@/lib/calendar';
import { getDevice, getCalendarPriority } from '@/lib/devicedetect.js';
import { downloadICSFeed } from '@/lib/calendarFeed';
import OutlookIcon from '@/components/outlookicon.jsx';
import { appPath } from '@/lib/authReturnTo';

export default function BookingConfirmation() {
  const location = useLocation();
  const { booking, event, host } = (location.state || {});
  const [copied, setCopied] = useState(false);

  if (!booking) {
    return (
      <div className="min-h-screen flex flex-col items-center justify-center gap-3 px-4 text-center">
        <div className="w-14 h-14 rounded-2xl glass flex items-center justify-center"><CheckCircle2 className="w-7 h-7 accent-text" /></div>
        <h1 className="text-xl font-semibold">You're all set</h1>
        <p className="text-sm text-muted-foreground">Your booking is confirmed.</p>
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

  const waMsg = fillTemplate(DEFAULT_CONFIRMATION_TEMPLATE, {
    guestName: booking.guest_name,
    hostName,
    date, time,
    duration: `${event?.duration || 30} min`,
    meetingUrl,
    timezone: tz,
  });

  const copyLink = () => { navigator.clipboard.writeText(meetingUrl); setCopied(true); setTimeout(()=>setCopied(false),2000); };

  const device = getDevice();
  const calendarPriority = getCalendarPriority();
  const bookingUrl = booking ? `${window.location.origin}${appPath(`/book/${booking.event_type_id}`)}` : '';

  const calendarButtons = {
    apple: { icon: Apple, label: 'Apple Calendar', action: () => openAppleCalendar(booking, event, host), primary: true },
    google: { icon: Calendar, label: 'Google Calendar', action: () => openGoogleCalendar(booking, event, host), primary: true },
    outlook: { icon: OutlookIcon, label: 'Outlook', action: () => openOutlookCalendar(booking, event, host), primary: true },
    webcal: { icon: Download, label: 'Download .ics', action: () => downloadIcs(booking, event, host), primary: false },
  };

  const orderedButtons = calendarPriority.map((k) => calendarButtons[k]).filter(Boolean);
  const primaryButtons = orderedButtons.filter((b) => b.primary);
  const secondaryButtons = orderedButtons.filter((b) => !b.primary);

  return (
    <div className="min-h-screen" style={{ ['--accent-color']: event?.color ? hexToHsl(event.color) : undefined }}>
      <div className="max-w-xl mx-auto px-4 py-10 sm:py-16">
        <div className="flex items-center gap-2 mb-8 justify-center">
          <div className="w-8 h-8 rounded-lg accent-bg flex items-center justify-center"><Sparkles className="w-4 h-4 text-white" /></div>
          <span className="font-semibold">GlassMeet</span>
        </div>

        <div className="glass-panel p-8 text-center animate-scale-in">
          <div className="w-16 h-16 rounded-2xl accent-bg flex items-center justify-center mx-auto mb-5 shadow-lg">
            <CheckCircle2 className="w-8 h-8 text-white" />
          </div>
          <h1 className="text-2xl font-semibold mb-2">You're all set{booking.guest_name ? `, ${booking.guest_name.split(' ')[0]}` : ''}.</h1>
          <p className="text-muted-foreground text-sm mb-6">Your meeting with {hostName} is confirmed.</p>

          {/* Event details */}
          <div className="glass rounded-2xl p-5 text-left space-y-3 mb-6">
            <Row icon={Calendar} label="Date" value={date} />
            <Row icon={Clock} label="Time" value={`${time} – ${endTime} · ${event?.duration || 30} min`} />
            <Row icon={Globe} label="Time zone" value={tz} />
            {event?.location && <Row icon={Video} label="Location" value={event.location} />}
            {meetingUrl && <Row icon={Video} label="Meeting" value={meetingUrl} />}
          </div>

          {/* Calendar actions — device-aware ordering */}
          <div className="flex flex-col gap-2 mb-3">
            <GlassButton variant="primary" size="lg" onClick={()=>window.open(buildWhatsAppLink(booking.guest_phone, waMsg), '_blank')}>
              <MessageCircle className="w-4 h-4" /> Open WhatsApp
            </GlassButton>
            <div className="grid grid-cols-2 gap-2">
              {primaryButtons.slice(0, 2).map((btn, i) => (
                <GlassButton key={btn.label} size="md" variant={i === 0 ? 'primary' : 'default'} onClick={btn.action}>
                  <btn.icon className="w-4 h-4" /> {btn.label}
                </GlassButton>
              ))}
            </div>
            {primaryButtons.length > 2 && (
              <div className="grid grid-cols-2 gap-2">
                {primaryButtons.slice(2).map((btn) => (
                  <GlassButton key={btn.label} size="md" onClick={btn.action}>
                    <btn.icon className="w-4 h-4" /> {btn.label}
                  </GlassButton>
                ))}
              </div>
            )}
            {secondaryButtons.map((btn) => (
              <GlassButton key={btn.label} size="sm" variant="ghost" onClick={btn.action}>
                <btn.icon className="w-4 h-4" /> {btn.label}
              </GlassButton>
            ))}
            <GlassButton size="sm" variant="ghost" onClick={() => downloadICSFeed([booking], 'glassmeet-event.ics')}>
              <Rss className="w-4 h-4" /> Subscribe to calendar
            </GlassButton>
          </div>

          {meetingUrl && (
            <GlassButton size="sm" variant="ghost" onClick={copyLink} className="mb-2">
              {copied ? <Check className="w-4 h-4 accent-text" /> : <Copy className="w-4 h-4" />} {copied ? 'Link copied' : 'Copy meeting link'}
            </GlassButton>
          )}

          <div className="glass rounded-xl p-3 mt-5 text-left">
            <div className="text-xs text-muted-foreground mb-1 flex items-center gap-1.5"><MessageCircle className="w-3.5 h-3.5" /> WhatsApp message</div>
            <pre className="text-sm whitespace-pre-wrap font-body">{waMsg}</pre>
          </div>
        </div>

        <p className="text-center text-xs text-muted-foreground mt-6">Need to cancel? Contact {hostName} directly on WhatsApp.</p>
      </div>
    </div>
  );
}

function Row({ icon: Icon, label, value }) {
  return (
    <div className="flex items-start gap-3">
      <Icon className="w-4 h-4 accent-text mt-0.5 shrink-0" />
      <div className="min-w-0">
        <div className="text-[11px] text-muted-foreground uppercase tracking-wide">{label}</div>
        <div className="text-sm break-words">{value}</div>
      </div>
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
import React, { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { Video } from 'lucide-react';
import { api } from '@/lib/localApi';
import { useBetaFeature } from '@/lib/beta';
import { cn } from '@/lib/utils';

const MINUTE = 60000;
const JOIN_WINDOW = 10 * MINUTE; // the Join button shows this long before the start
const SHOW_WITHIN = 24 * 60 * MINUTE;

const untilLabel = (ms) => {
  const minutes = Math.max(1, Math.ceil(ms / MINUTE));
  if (minutes < 60) return `${minutes} min`;
  const hours = Math.floor(minutes / 60);
  const rest = minutes % 60;
  return rest ? `${hours} hr ${rest} min` : `${hours} hr`;
};

// a meeting link is typed by the host: only ever open a web address
const safeLink = (url) => (/^https?:\/\//i.test(url || '') ? url : '');

// Beta: the next meeting within a day and how far away it is, or null. Asks nothing while the
// feature is off.
export function useNextMeeting(hostId) {
  const on = useBetaFeature('countdown');
  const [meetings, setMeetings] = useState([]);
  const [now, setNow] = useState(() => Date.now());

  useEffect(() => {
    if (!on || !hostId) return undefined;
    let live = true;
    const load = () => {
      // from a day back: a long meeting that started earlier may still be running
      const since = new Date(Date.now() - SHOW_WITHIN).toISOString();
      api.entities.Booking.filter({ host_id: hostId, start_time: { gte: since } }, 'start_time', 50, 'id, guest_name, start_time, end_time, status, approval_status, meeting_url')
        .then((list) => { if (live) setMeetings(list.filter((b) => b.status === 'confirmed' && b.approval_status === 'approved')); })
        .catch(() => { /* a missed refresh keeps what's known */ });
    };
    load();
    const refresh = setInterval(load, 5 * MINUTE);
    const tick = setInterval(() => setNow(Date.now()), 20000);
    const onFocus = () => { load(); setNow(Date.now()); };
    window.addEventListener('focus', onFocus);
    return () => { live = false; clearInterval(refresh); clearInterval(tick); window.removeEventListener('focus', onFocus); };
  }, [on, hostId]);

  if (!on || !hostId) return null;
  const booking = meetings.find((b) => new Date(b.end_time).getTime() > now);
  if (!booking) return null;
  const away = new Date(booking.start_time).getTime() - now;
  return away > SHOW_WITHIN ? null : { booking, away };
}

export default function NextMeeting({ next, className }) {
  if (!next) return null;
  const { booking, away } = next;
  const running = away <= 0;
  const link = safeLink(booking.meeting_url);
  const guest = booking.guest_name || 'Meeting';

  return (
    <div className={cn('min-w-0 items-center gap-1.5', className)}>
      <Link
        to={`/bookings?id=${booking.id}`}
        title={`Next meeting: ${guest}`}
        aria-label={running ? `Meeting with ${guest} is on now` : `Next meeting with ${guest} in ${untilLabel(away)}`}
        className="flex h-10 min-w-0 flex-1 items-center gap-2 rounded-full border border-border bg-card px-3 text-sm transition-all duration-200 hover:border-border-hover"
      >
        <span className={cn('h-2 w-2 shrink-0 rounded-full', running || away <= JOIN_WINDOW ? 'bg-success' : 'bg-primary')} aria-hidden="true" />
        <span className="min-w-0 max-w-[10rem] truncate font-semibold max-lg:max-w-none">{guest}</span>
        <span className="ml-auto whitespace-nowrap text-muted-foreground tabular">{running ? 'Now' : `in ${untilLabel(away)}`}</span>
      </Link>
      {link && away <= JOIN_WINDOW && (
        <a href={link} target="_blank" rel="noreferrer" aria-label={`Join the meeting with ${guest}`} className="flex h-10 shrink-0 items-center gap-1.5 rounded-full bg-primary px-3.5 text-sm font-semibold text-primary-foreground transition-all duration-200 hover:bg-primary-hover">
          <Video className="h-4 w-4" aria-hidden="true" /> Join
        </a>
      )}
    </div>
  );
}

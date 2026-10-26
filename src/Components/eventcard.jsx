import React, { Suspense, lazy, useState } from 'react';
import { Link } from 'react-router-dom';
import { Link2, Check, Settings2, Pencil, Trash2, Power, Code2, Copy } from 'lucide-react';
import { buildWhatsAppShareLink } from '@/lib/whatsapp';
import { appPath } from '@/lib/authReturnTo';
import { cn } from '@/lib/utils';
import { useBetaFeature } from '@/lib/beta';

const EmbedDialog = lazy(() => import('@/components/EmbedDialog.jsx'));

const WEEKDAYS = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
const shortDate = (key) => { const [y, m, d] = key.split('-').map(Number); return new Date(y, m - 1, d).toLocaleDateString(undefined, { day: 'numeric', month: 'short' }); };

const ordinal = (n) => `${n}${[, 'st', 'nd', 'rd'][(n % 100 >> 3 ^ 1) && n % 10] || 'th'}`;
const unit = (every, one) => (every === 1 ? one : `${every} ${one}s`);

// "Every week", "Every 2 weeks on Mon, Wed until 12 Dec", "Monthly on the 5th", "3 dates"
export const scheduleSummary = (event) => {
  if (event.schedule === 'dates') {
    const n = event.dates?.length || 0;
    return n === 1 ? `On ${shortDate(event.dates[0])}` : `${n} dates`;
  }
  const every = Math.max(1, Number(event.every) || 1);
  let text;
  if (event.freq === 'day') text = every === 1 ? 'Every day' : `Every ${unit(every, 'day')}`;
  else if (event.freq === 'month') {
    const day = event.start_date ? ordinal(Number(event.start_date.slice(8))) : null;
    text = `${every === 1 ? 'Monthly' : `Every ${unit(every, 'month')}`}${day ? ` on the ${day}` : ''}`;
  } else {
    const days = event.days?.length && event.days.length < 7 ? [...event.days].sort().map((d) => WEEKDAYS[d]).join(', ') : null;
    text = `Every ${unit(every, 'week')}${days ? ` on ${days}` : ''}`;
  }
  return event.end_date ? `${text} until ${shortDate(event.end_date)}` : text;
};

export const bookingUrlFor = (id) => `${window.location.origin}${appPath(`/book/${id}`)}`;

// Calendly event-type card: colour strip on top, name + duration, Copy link and Share in the footer.
export default function EventCard({ event, onEdit, onDelete, onToggle, onSaveTemplate }) {
  const [copied, setCopied] = useState(false);
  const [menu, setMenu] = useState(false);
  const [embedding, setEmbedding] = useState(false);
  const embedOn = useBetaFeature('embed');
  const url = bookingUrlFor(event.id);
  const active = event.active ?? true;
  const kind = event.booking_type === 'group' ? `Group, up to ${event.max_attendees || 2}` : 'One-on-One';

  const copy = () => {
    navigator.clipboard.writeText(url);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  return (
    <div className={cn('relative flex flex-col rounded-xl border border-border bg-card shadow-card transition-all duration-200 hover:border-border-hover', !active && 'opacity-70')}>
      <div className="h-1.5 rounded-t-xl" style={{ background: active ? (event.color || 'var(--primary)') : 'var(--border-hover)' }} />
      <div className="flex-1 px-5 pt-4 pb-5">
        <div className="flex items-start justify-between gap-3">
          <div className="min-w-0">
            <h3 className="text-[17px] font-bold leading-snug truncate">{event.name}</h3>
            <p className="mt-1 text-sm text-muted-foreground">{event.duration || 30} mins, {kind}</p>
            <p className="mt-0.5 text-sm text-muted-foreground truncate">{scheduleSummary(event)}</p>
          </div>
          {(onEdit || onDelete || onToggle) && (
            <div className="relative">
              <button
                type="button"
                onClick={() => setMenu((v) => !v)}
                aria-label="Event options"
                aria-expanded={menu}
                className="w-8 h-8 -mr-1 rounded-full flex items-center justify-center text-muted-foreground transition-all duration-200 hover:bg-secondary hover:text-foreground"
              >
                <Settings2 className="w-[18px] h-[18px]" />
              </button>
              {menu && (
                <>
                  <div className="fixed inset-0 z-30" onClick={() => setMenu(false)} />
                  <div className="absolute right-0 top-9 z-40 w-48 rounded-lg border border-border bg-popover py-1.5 shadow-pop animate-scale-in">
                    {onEdit && <MenuItem icon={Pencil} onClick={() => { setMenu(false); onEdit(); }}>Edit</MenuItem>}
                    {onSaveTemplate && <MenuItem icon={Copy} onClick={() => { setMenu(false); onSaveTemplate(); }}>Save as template</MenuItem>}
                    {embedOn && <MenuItem icon={Code2} onClick={() => { setMenu(false); setEmbedding(true); }}>Add to website</MenuItem>}
                    {onToggle && <MenuItem icon={Power} onClick={() => { setMenu(false); onToggle(!active); }}>{active ? 'Turn off' : 'Turn on'}</MenuItem>}
                    {onDelete && <MenuItem icon={Trash2} danger onClick={() => { setMenu(false); onDelete(); }}>Delete</MenuItem>}
                  </div>
                </>
              )}
            </div>
          )}
        </div>
        <Link to={`/book/${event.id}`} className="mt-3 inline-block text-sm font-semibold text-link hover:underline">View booking page</Link>
      </div>
      <div className="flex items-center justify-between gap-3 border-t border-border px-5 py-3">
        <button type="button" onClick={copy} className="flex items-center gap-1.5 text-sm font-semibold text-link hover:underline">
          {copied ? <Check className="w-4 h-4" /> : <Link2 className="w-4 h-4" />} {copied ? 'Copied' : 'Copy link'}
        </button>
        {active ? (
          <a
            href={buildWhatsAppShareLink(`Book a time with me: ${url}`)}
            target="_blank"
            rel="noreferrer"
            className="h-8 px-4 rounded-full border border-primary text-link text-sm font-semibold flex items-center transition-all duration-200 hover:bg-primary-soft"
          >
            Share
          </a>
        ) : (
          <span className="text-sm font-semibold text-muted-foreground">Turned off</span>
        )}
      </div>
      {embedding && <Suspense fallback={null}><EmbedDialog event={event} onClose={() => setEmbedding(false)} /></Suspense>}
    </div>
  );
}

function MenuItem({ icon: Icon, children, danger, as: Comp = 'button', ...props }) {
  return (
    <Comp
      type={Comp === 'button' ? 'button' : undefined}
      className={cn('w-full flex items-center gap-2.5 px-3.5 h-9 text-sm text-left transition-all duration-200 hover:bg-secondary', danger ? 'text-destructive' : 'text-foreground')}
      {...props}
    >
      <Icon className="w-4 h-4 opacity-70" /> {children}
    </Comp>
  );
}

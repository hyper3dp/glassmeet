import React, { useCallback, useEffect, useLayoutEffect, useRef, useState } from 'react';
import { X } from 'lucide-react';
import { GlassButton } from '@/components/glass';

// The stops, each pointing at the first visible element marked data-tour="<target>" (the
// sidebar on desktop, the bottom tab bar or the menu button on phones)
const STOPS = [
  { targets: ['create', 'menu'], title: 'Create an event type', text: 'An event type is a meeting guests can book, like a 30 minute call. Start here.' },
  { targets: ['scheduling', 'menu'], title: 'Scheduling', text: 'All your event types and their booking links, ready to share on WhatsApp.' },
  { targets: ['meetings', 'menu'], title: 'Meetings', text: 'Everything guests book shows up here. Approve requests and message guests from one place.' },
  { targets: ['availability', 'menu'], title: 'Availability', text: 'Your weekly hours, breaks and days off. Guests only see times you’re free.' },
  { targets: ['account'], title: 'Your account', text: 'Settings, your WhatsApp number, and this tour again whenever you want it.' },
];

const GAP = 12;
const CARD_W = 300;

const isShown = (el) => {
  const r = el.getBoundingClientRect();
  return r.width > 0 && r.height > 0 && getComputedStyle(el).visibility !== 'hidden';
};
const findTarget = (stop) => {
  for (const t of stop.targets) {
    const el = [...document.querySelectorAll(`[data-tour="${t}"]`)].find(isShown);
    if (el) return el;
  }
  return null;
};

// Spotlight tour over the real app: dims the page around one control at a time with a short
// note next to it. Escape or "Skip tour" ends it.
export default function Tour({ onClose }) {
  const [index, setIndex] = useState(0);
  const [rect, setRect] = useState(null);
  const [cardPos, setCardPos] = useState(null);
  const cardRef = useRef(null);
  const stop = STOPS[index];
  const last = index === STOPS.length - 1;

  const measure = useCallback(() => {
    const el = findTarget(stop);
    if (!el) { setRect(null); return; }
    el.scrollIntoView?.({ block: 'nearest' });
    const r = el.getBoundingClientRect();
    setRect({ top: r.top - 4, left: r.left - 4, width: r.width + 8, height: r.height + 8 });
  }, [stop]);

  useLayoutEffect(() => { measure(); }, [measure]);
  useEffect(() => {
    window.addEventListener('resize', measure);
    window.addEventListener('scroll', measure, true);
    return () => { window.removeEventListener('resize', measure); window.removeEventListener('scroll', measure, true); };
  }, [measure]);

  // the note goes beside the control when there's room, else below or above it; centred when
  // the control isn't on screen at all
  useLayoutEffect(() => {
    const card = cardRef.current;
    if (!card) return;
    const vw = window.innerWidth, vh = window.innerHeight;
    const w = Math.min(CARD_W, vw - 32), h = card.offsetHeight;
    const clampX = (x) => Math.max(16, Math.min(x, vw - w - 16));
    const clampY = (y) => Math.max(16, Math.min(y, vh - h - 16));
    if (!rect) { setCardPos({ left: (vw - w) / 2, top: (vh - h) / 2, width: w }); return; }
    if (rect.left + rect.width + GAP + w <= vw - 16) setCardPos({ left: rect.left + rect.width + GAP, top: clampY(rect.top), width: w });
    else if (rect.top + rect.height + GAP + h <= vh - 16) setCardPos({ left: clampX(rect.left), top: rect.top + rect.height + GAP, width: w });
    else setCardPos({ left: clampX(rect.left), top: clampY(rect.top - GAP - h), width: w });
  }, [rect, index]);

  useEffect(() => { cardRef.current?.focus(); }, [index]);
  useEffect(() => {
    const onKey = (e) => {
      if (e.key === 'Escape') onClose();
      if (e.key === 'ArrowRight' && !last) setIndex((i) => i + 1);
      if (e.key === 'ArrowLeft' && index > 0) setIndex((i) => i - 1);
    };
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, [index, last, onClose]);

  return (
    <div className="fixed inset-0 z-[60]" role="presentation">
      {/* clicks outside the note do nothing, so the page underneath can't be changed mid-tour */}
      {rect ? (
        <div aria-hidden="true" className="fixed rounded-xl ring-2 ring-ring transition-all duration-200 pointer-events-none"
          style={{ ...rect, boxShadow: '0 0 0 9999px var(--scrim)' }} />
      ) : (
        <div aria-hidden="true" className="fixed inset-0 bg-scrim" />
      )}
      <div
        ref={cardRef}
        role="dialog"
        aria-modal="true"
        aria-labelledby="tour-title"
        aria-describedby="tour-text"
        tabIndex={-1}
        className="fixed rounded-xl border border-border bg-popover p-5 shadow-pop outline-none transition-all duration-200 animate-scale-in"
        style={cardPos || { left: -9999, top: 0, width: CARD_W }}
      >
        <div className="flex items-start justify-between gap-3">
          <h2 id="tour-title" className="text-[15px] font-bold">{stop.title}</h2>
          <button type="button" onClick={onClose} aria-label="Skip tour" className="-mr-2 -mt-1 w-8 h-8 shrink-0 rounded-full flex items-center justify-center text-muted-foreground transition-all duration-200 hover:bg-secondary hover:text-foreground">
            <X className="w-4 h-4" />
          </button>
        </div>
        <p id="tour-text" className="mt-1.5 text-sm text-muted-foreground">{stop.text}</p>
        <div className="mt-5 flex items-center justify-between gap-2">
          <span className="text-xs font-semibold text-muted-foreground tabular">{index + 1} of {STOPS.length}</span>
          <div className="flex items-center gap-1.5">
            {index > 0 ? (
              <GlassButton type="button" size="sm" variant="ghost" onClick={() => setIndex((i) => i - 1)}>Back</GlassButton>
            ) : (
              <GlassButton type="button" size="sm" variant="ghost" onClick={onClose}>Skip tour</GlassButton>
            )}
            <GlassButton type="button" size="sm" variant="primary" onClick={() => (last ? onClose() : setIndex((i) => i + 1))}>
              {last ? 'Done' : 'Next'}
            </GlassButton>
          </div>
        </div>
      </div>
    </div>
  );
}

import { useEffect } from 'react';

// Booking pages can run inside an iframe on another website (public/embed.js builds it).
// The frame URL carries ?embed=1 and optionally &theme=light|dark. The embedded page drops the
// page background and padding, tells the parent its height, and announces finished bookings.

const params = () => new URLSearchParams(window.location.search);

// sessionStorage keeps embed mode across the in-frame step from booking page to confirmation
export const isEmbed = () => {
  try {
    if (params().get('embed') === '1') { sessionStorage.setItem('gm-embed', '1'); return true; }
    return window.self !== window.top && sessionStorage.getItem('gm-embed') === '1';
  } catch {
    return params().get('embed') === '1';
  }
};

export const embedTheme = () => {
  const theme = params().get('theme');
  return isEmbed() && (theme === 'light' || theme === 'dark') ? theme : undefined;
};

const post = (message) => {
  if (window.parent !== window) window.parent.postMessage({ source: 'glassmeet', ...message }, '*');
};

// Escape inside the frame closes the pop-up (the parent page never sees keys pressed in here)
if (typeof window !== 'undefined' && window.parent !== window) {
  window.addEventListener('keydown', (e) => { if (e.key === 'Escape' && isEmbed()) post({ type: 'close' }); });
}

// Keep the parent iframe as tall as the page so the frame never scrolls on its own
export function useEmbedResize(active) {
  useEffect(() => {
    if (!active) return undefined;
    let last = 0;
    const send = () => {
      // the body's own height: the document's scrollHeight never drops below the frame height,
      // so it could only ever grow
      const height = Math.ceil(document.body.getBoundingClientRect().height);
      if (height !== last) { last = height; post({ type: 'height', height }); }
    };
    const observer = new ResizeObserver(send);
    observer.observe(document.body);
    send();
    return () => observer.disconnect();
  }, [active]);
}

// Only times and the event name: guest details never leave the frame
export const announceBooked = ({ booking, event }) => post({
  type: 'booked',
  booking: { id: booking?.id, start: booking?.start_time, end: booking?.end_time, status: booking?.status },
  event: { id: event?.id, name: event?.name },
});

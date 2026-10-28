import React, { lazy, Suspense, useState } from 'react';
import { useLocation } from 'react-router-dom';
import { Bug } from 'lucide-react';
import { reportsOpen } from '@/lib/bugReport.js';
import { isEmbed } from '@/lib/embed.js';
import { useAuth } from '@/lib/Authcontext.jsx';

// the form loads when it's first opened, so the button costs pages next to nothing
const BugReportDialog = lazy(() => import('@/components/BugReportDialog.jsx'));

// app pages have a fixed tab bar along the bottom on phones (Layout.jsx)
const APP_PAGES = /^\/(dashboard|calendar|event-types|bookings|availability|whatsapp|settings|calendar-connections|analytics)(\/|$)/;

// Temporary launch button (see lib/bugReport.js). Desktop: floats bottom-right. Phones: a link
// at the end of the page, since anything floating there covers dates, times or the tab bar.
// Hidden inside another site's embed.
export default function BugReport() {
  const [open, setOpen] = useState(false);
  const { pathname } = useLocation();
  const { authChecked } = useAuth();
  // after the sign-in check, so the link doesn't flash above the full-screen loader
  if (!authChecked || !reportsOpen() || isEmbed()) return null;
  const show = () => setOpen(true);
  return (
    <>
      <button
        type="button"
        onClick={show}
        className="hidden md:flex fixed z-40 right-4 bottom-4 h-10 px-4 rounded-full items-center gap-2 border border-border bg-card text-muted-foreground text-sm font-semibold shadow-card hover:border-border-hover hover:text-foreground transition-all duration-200 print:hidden"
      >
        <Bug className="w-4 h-4" /> Report a bug
      </button>
      <div className={`md:hidden flex justify-center pt-4 print:hidden ${APP_PAGES.test(pathname) ? 'pb-[calc(5.5rem+env(safe-area-inset-bottom))]' : 'pb-[max(1.5rem,env(safe-area-inset-bottom))]'}`}>
        <button type="button" onClick={show} className="h-10 px-4 rounded-full inline-flex items-center gap-2 text-sm font-semibold text-muted-foreground hover:text-foreground transition-all duration-200">
          <Bug className="w-4 h-4" /> Found a bug? Report it
        </button>
      </div>
      {open && (
        <Suspense fallback={null}>
          <BugReportDialog onClose={() => setOpen(false)} />
        </Suspense>
      )}
    </>
  );
}

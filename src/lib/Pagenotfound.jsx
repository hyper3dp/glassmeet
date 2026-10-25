import { Link, useLocation, useNavigate } from 'react-router-dom';
import { ArrowLeft, CalendarX2, ChevronLeft, ChevronRight, Globe } from 'lucide-react';
import { useAuth } from '@/lib/Authcontext.jsx';
import Logo, { LogoMark } from '@/components/logo.jsx';
import { GlassButton } from '@/components/glass';

const WEEKDAYS = ['SUN', 'MON', 'TUE', 'WED', 'THU', 'FRI', 'SAT'];

// 404 in the booking page's own form: a card whose month has no open days.
export default function PageNotFound() {
  const location = useLocation();
  const navigate = useNavigate();
  const { isAuthenticated } = useAuth();

  const now = new Date();
  const first = new Date(now.getFullYear(), now.getMonth(), 1);
  const daysInMonth = new Date(now.getFullYear(), now.getMonth() + 1, 0).getDate();
  const cells = [...Array(first.getDay()).fill(null), ...Array.from({ length: daysInMonth }, (_, i) => i + 1)];
  const monthLabel = now.toLocaleDateString('en-US', { month: 'long', year: 'numeric' });

  return (
    <div className="min-h-screen bg-background flex flex-col">
      <header className="px-4 sm:px-6 h-16 flex items-center max-w-6xl w-full mx-auto">
        <Logo to="/" />
      </header>

      <main className="flex-1 flex items-center justify-center px-4 sm:px-6 py-10">
        <div className="relative w-full max-w-[860px] overflow-hidden rounded-xl border border-border bg-card shadow-card animate-fade-in">
          <div className="grid md:grid-cols-[340px_1fr]">
            {/* Details */}
            <section className="border-b md:border-b-0 md:border-r border-border p-6 sm:p-8 flex flex-col">
              <LogoMark size={44} />
              <p className="mt-6 text-[15px] font-semibold text-muted-foreground tabular">Error 404</p>
              <h1 className="mt-1 text-[28px] font-bold leading-tight">Page not found</h1>
              <p className="mt-4 text-[15px] leading-relaxed text-muted-foreground">
                The link may be mistyped, or the booking page it pointed to was removed or turned off.
              </p>
              <div className="mt-5 flex items-start gap-3 rounded-lg bg-secondary px-3.5 py-3 text-sm">
                <Globe className="w-4 h-4 mt-0.5 shrink-0 text-muted-foreground" />
                <span className="break-all font-semibold text-foreground">{location.pathname}</span>
              </div>
              <div className="mt-8 md:mt-auto pt-2 flex flex-wrap gap-2">
                <Link to={isAuthenticated ? '/dashboard' : '/'}>
                  <GlassButton variant="primary" type="button">{isAuthenticated ? 'Go to dashboard' : 'Back to home'}</GlassButton>
                </Link>
                <GlassButton type="button" onClick={() => navigate(-1)}><ArrowLeft className="w-4 h-4" /> Go back</GlassButton>
              </div>
            </section>

            {/* A month with nothing to book */}
            <section className="p-6 sm:p-8" aria-hidden="true">
              <h2 className="text-xl font-bold mb-6">Select a Date &amp; Time</h2>
              <div className="max-w-[420px] mx-auto">
                <div className="flex items-center justify-center gap-6 mb-6">
                  <span className="w-10 h-10 rounded-full flex items-center justify-center text-hint"><ChevronLeft className="w-5 h-5" /></span>
                  <span className="w-40 text-center text-[15px] font-semibold">{monthLabel}</span>
                  <span className="w-10 h-10 rounded-full flex items-center justify-center text-hint"><ChevronRight className="w-5 h-5" /></span>
                </div>
                <div className="grid grid-cols-7 mb-2">
                  {WEEKDAYS.map((d) => <div key={d} className="text-center text-[11px] font-semibold text-muted-foreground py-1">{d}</div>)}
                </div>
                <div className="relative">
                  <div className="grid grid-cols-7 gap-y-1.5 opacity-60">
                    {cells.map((d, i) => (
                      <div key={i} className="flex items-center justify-center">
                        {d && <span className="w-10 h-10 rounded-full flex items-center justify-center text-[15px] text-hint line-through decoration-hint/50 tabular">{d}</span>}
                      </div>
                    ))}
                  </div>
                  <div className="absolute inset-0 flex items-center justify-center">
                    <div className="flex items-center gap-3 rounded-full border border-border bg-card px-5 py-3 shadow-pop">
                      <CalendarX2 className="w-5 h-5 text-link" />
                      <span className="text-sm font-bold">Nothing is scheduled at this address</span>
                    </div>
                  </div>
                </div>
              </div>
            </section>
          </div>
        </div>
      </main>
    </div>
  );
}

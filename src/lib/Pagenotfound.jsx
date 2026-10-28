import { useState } from 'react';
import { Link, useLocation, useNavigate } from 'react-router-dom';
import { ArrowLeft, Plus, Search, Globe } from 'lucide-react';
import { useAuth } from '@/lib/Authcontext.jsx';
import Logo from '@/components/logo.jsx';
import { GlassButton, GlassInput } from '@/components/glass';

const HOURS = ['9 AM', '10 AM', '11 AM', '12 PM', '1 PM', '2 PM', '3 PM', '4 PM', '5 PM'];

// 404: an empty day planner with a tumbleweed rolling through it. Nothing is booked, because
// nothing is here. The way back is to schedule something real.
export default function PageNotFound() {
  const location = useLocation();
  const navigate = useNavigate();
  const { isAuthenticated } = useAuth();
  const [query, setQuery] = useState('');

  const today = new Date().toLocaleDateString('en-US', { weekday: 'long', month: 'long', day: 'numeric' });
  const search = (e) => {
    e.preventDefault();
    const q = query.trim();
    navigate(q ? `/bookings?q=${encodeURIComponent(q)}` : '/bookings');
  };

  return (
    <div className="min-h-screen bg-background flex flex-col">
      <header className="px-4 sm:px-6 h-16 flex items-center max-w-6xl w-full mx-auto">
        <Logo to="/" />
      </header>

      <main className="flex-1 flex items-center justify-center px-4 sm:px-6 py-10">
        <div className="w-full max-w-[920px] overflow-hidden rounded-xl border border-border bg-card shadow-card animate-fade-in">
          <div className="grid md:grid-cols-[360px_1fr]">
            {/* What happened, and the way back */}
            <section className="order-2 md:order-1 border-t md:border-t-0 md:border-r border-border p-6 sm:p-8 flex flex-col">
              <p className="text-sm font-semibold text-muted-foreground tabular">Error 404</p>
              <h1 className="mt-1 text-[28px] sm:text-[32px] font-bold leading-tight">Nothing scheduled here.</h1>
              <p className="mt-3 text-[17px] leading-relaxed text-muted-foreground">
                Literally. This page doesn&rsquo;t exist.
              </p>
              <div className="mt-5 flex items-start gap-3 rounded-lg bg-secondary px-3.5 py-3 text-sm">
                <Globe className="w-4 h-4 mt-0.5 shrink-0 text-muted-foreground" aria-hidden="true" />
                <span className="break-all font-semibold text-foreground">{location.pathname}</span>
              </div>

              <div className="mt-8 md:mt-auto pt-2 space-y-3">
                {isAuthenticated && (
                  <form onSubmit={search} role="search">
                    <label htmlFor="nf-search" className="sr-only">Search your meetings</label>
                    <div className="relative">
                      <Search className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-hint" aria-hidden="true" />
                      <GlassInput id="nf-search" type="search" enterKeyHint="search" value={query} onChange={(e) => setQuery(e.target.value)} placeholder="Search meetings by guest name or phone" className="pl-9 h-11" />
                    </div>
                  </form>
                )}
                {/* signed-out visitors are mostly guests with a mistyped or old booking link */}
                {!isAuthenticated && (
                  <p className="text-sm text-muted-foreground">Got this link from someone to book a meeting? Ask them to send it again.</p>
                )}
                <div className="flex flex-wrap gap-2">
                  {isAuthenticated && (
                    <Link to="/event-types?new=true">
                      <GlassButton variant="primary" type="button"><Plus className="w-4 h-4" strokeWidth={2.5} /> Schedule a new event</GlassButton>
                    </Link>
                  )}
                  <GlassButton variant={isAuthenticated ? undefined : 'primary'} type="button" onClick={() => (window.history.length > 1 ? navigate(-1) : navigate(isAuthenticated ? '/dashboard' : '/'))}>
                    <ArrowLeft className="w-4 h-4" /> Go back
                  </GlassButton>
                </div>
              </div>
            </section>

            {/* An empty day, and a tumbleweed */}
            <section className="order-1 md:order-2 p-6 sm:p-8" aria-hidden="true">
              <div className="flex items-baseline justify-between gap-3 mb-5">
                <h2 className="text-xl font-bold">Today</h2>
                <span className="text-sm text-muted-foreground truncate">{today}</span>
              </div>
              <div className="nf-planner relative rounded-lg border border-border overflow-hidden">
                {HOURS.map((h) => (
                  <div key={h} className="flex h-10 sm:h-12 border-b border-border last:border-b-0">
                    <span className="w-14 sm:w-16 shrink-0 border-r border-border px-2 pt-1 text-[11px] font-semibold text-hint tabular">{h}</span>
                    <span className="flex-1" />
                  </div>
                ))}

                {/* the wind, then the tumbleweed riding the 1 PM line */}
                <span className="nf-gust" style={{ top: '38%' }} />
                <span className="nf-gust nf-gust-late" style={{ top: '62%' }} />
                <div className="nf-track" style={{ top: 'calc(5 / 9 * 100% - 64px)' }}>
                  <div className="nf-roll">
                    <div className="nf-hop">
                      <Tumbleweed className="nf-spin w-12 h-12 sm:w-14 sm:h-14 text-muted-foreground" />
                    </div>
                    <span className="nf-shadow" />
                  </div>
                </div>

                <span className="absolute bottom-2 right-3 text-[11px] font-semibold text-hint">No events</span>
              </div>
            </section>
          </div>
        </div>
      </main>
    </div>
  );
}

// A loose ball of twigs; strokes take the text colour so it follows light and dark
function Tumbleweed({ className }) {
  return (
    <svg viewBox="0 0 64 64" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" className={className}>
      <circle cx="32" cy="32" r="26" opacity="0.55" />
      <ellipse cx="32" cy="32" rx="26" ry="14" transform="rotate(25 32 32)" />
      <ellipse cx="32" cy="32" rx="24" ry="11" transform="rotate(-40 32 32)" />
      <ellipse cx="32" cy="32" rx="22" ry="17" transform="rotate(80 32 32)" opacity="0.8" />
      <ellipse cx="33" cy="31" rx="15" ry="9" transform="rotate(-10 33 31)" opacity="0.7" />
      <path d="M10 26c8 4 14 2 22 8s14 6 22 2" opacity="0.8" />
      <path d="M18 52c2-9 8-13 12-20s4-14 10-22" opacity="0.7" />
      <path d="M8 38l-4 3M56 22l4-3M45 55l3 4M20 9l-2-4M58 40l4 1" />
    </svg>
  );
}

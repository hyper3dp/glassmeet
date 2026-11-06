import { useState } from 'react';
import { Link, useLocation, useNavigate } from 'react-router-dom';
import { ArrowLeft, Plus, Search } from 'lucide-react';
import { useAuth } from '@/lib/Authcontext.jsx';
import Logo from '@/components/logo.jsx';
import { GlassButton, GlassInput } from '@/components/glass';
import { LIMITS } from '@/lib/inputRules';

// 404: says what happened and gives the way back. Signed-out visitors are mostly guests with a
// mistyped or old booking link; hosts can search their meetings or start a new event.
export default function PageNotFound() {
  const location = useLocation();
  const navigate = useNavigate();
  const { isAuthenticated } = useAuth();
  const [query, setQuery] = useState('');

  const search = (e) => {
    e.preventDefault();
    const q = query.trim();
    navigate(q ? `/bookings?q=${encodeURIComponent(q)}` : '/bookings');
  };

  return (
    <div className="flex min-h-screen flex-col bg-background">
      <header className="border-b border-border px-4 sm:px-6">
        <div className="mx-auto flex h-16 max-w-6xl items-center">
          <Logo to="/" />
        </div>
      </header>

      <main className="flex-1 px-4 py-16 sm:px-6 lg:py-24">
        <div className="mx-auto max-w-6xl">
          <h1 className="text-4xl font-bold leading-tight sm:text-5xl">Page not found</h1>
          <p className="mt-4 max-w-[34rem] break-words text-lg leading-relaxed text-muted-foreground">
            There is nothing at <span className="font-semibold text-foreground">{location.pathname}</span>.
            {!isAuthenticated && ' If someone sent you this link to book a meeting, ask them to send it again.'}
          </p>

          {isAuthenticated && (
            <form onSubmit={search} role="search" className="mt-8 max-w-[34rem]">
              <label htmlFor="nf-search" className="sr-only">Search your meetings</label>
              <div className="relative">
                <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-hint" aria-hidden="true" />
                <GlassInput id="nf-search" type="search" enterKeyHint="search" maxLength={LIMITS.search} value={query} onChange={(e) => setQuery(e.target.value)} placeholder="Search meetings by guest name, phone or email" className="pl-9" />
              </div>
            </form>
          )}

          <div className="mt-8 flex flex-wrap gap-3">
            {isAuthenticated && (
              <Link to="/event-types?new=true">
                <GlassButton variant="primary" type="button"><Plus className="h-4 w-4" strokeWidth={2.5} /> Schedule a new event</GlassButton>
              </Link>
            )}
            <GlassButton variant={isAuthenticated ? undefined : 'primary'} type="button" onClick={() => (window.history.length > 1 ? navigate(-1) : navigate(isAuthenticated ? '/dashboard' : '/'))}>
              <ArrowLeft className="h-4 w-4" /> Go back
            </GlassButton>
          </div>
        </div>
      </main>
    </div>
  );
}

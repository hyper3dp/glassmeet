import React, { useEffect } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { MessageCircle, Clock, Check, ArrowRight, ChevronLeft, ChevronRight, Video } from 'lucide-react';
import { cn } from '@/lib/utils';
import { GlassButton } from '@/components/glass';
import { useAuth } from '@/lib/Authcontext.jsx';
import Logo, { LogoMark } from '@/components/logo.jsx';

// Every line here describes something the app does today (see PRODUCT.md, "Promise only what ships").
const STEPS = [
  {
    title: 'Set your hours',
    body: 'Add your weekly availability and block or open specific dates. Then create an event type with a duration and a meeting link.',
  },
  {
    title: 'Share one link',
    body: 'Send your booking page in a WhatsApp chat, paste the link anywhere, or let people scan its QR code.',
  },
  {
    title: 'Confirm in WhatsApp',
    body: 'When someone books, GlassMeet drafts the confirmation. Open the chat with your guest and send it in one tap.',
  },
];

const FEATURES = [
  { title: 'Weekly hours and date overrides', body: 'Take meetings when you want to, and close or open single days without touching the rest of your week.' },
  { title: 'One-on-one and group events', body: 'Cap how many people can join a session, or approve each booking before it is confirmed.' },
  { title: 'Google Calendar', body: 'Connect it so times you are already busy stay off your booking page, and new bookings land on your calendar.' },
  { title: 'No account for guests', body: 'Guests leave a name, an email and their WhatsApp number, pick a time, and they are done.' },
  { title: 'Add to any calendar', body: 'After booking, guests get one-tap buttons for Google, Apple and Outlook, plus an .ics file.' },
  { title: 'Messages in your words', body: 'Edit the WhatsApp confirmation template so every message sounds like you wrote it.' },
];

const WEEKDAYS = ['SUN', 'MON', 'TUE', 'WED', 'THU', 'FRI', 'SAT'];
const UNAVAILABLE = new Set([0, 6, 7, 13, 14, 20]);
const SELECTED_DAY = 10;
const TIMES = ['9:00 AM', '9:30 AM', '10:00 AM', '11:30 AM', '2:00 PM'];
const SELECTED_TIME = 2;

// A static, Calendly-style preview of the guest booking page (illustrative, not live data).
function BookingPreview() {
  return (
    <div className="relative rounded-xl border border-border bg-card shadow-pop animate-scale-in" style={{ animationDelay: '0.1s' }} aria-hidden="true">
      <div className="grid sm:grid-cols-[1fr_1.35fr]">
        <div className="border-b border-border p-5 sm:border-r sm:border-b-0 sm:p-6">
          <div className="flex h-9 w-9 items-center justify-center rounded-full bg-primary-soft text-sm font-bold text-link">Y</div>
          <p className="mt-3 text-sm font-semibold text-muted-foreground">Your name</p>
          <p className="mt-1 text-xl font-bold leading-tight">30 Minute Consultation</p>
          <ul className="mt-4 space-y-2.5 text-sm font-semibold text-muted-foreground">
            <li className="flex items-center gap-2"><Clock className="h-4 w-4" /> 30 min</li>
            <li className="flex items-start gap-2"><Video className="h-4 w-4 mt-0.5 shrink-0" /> Meeting link on confirmation</li>
            <li className="flex items-center gap-2"><MessageCircle className="h-4 w-4" /> Confirmed on WhatsApp</li>
          </ul>
        </div>

        <div className="p-5 sm:p-6">
          <p className="text-base font-bold">Select a Date &amp; Time</p>
          <div className="mt-4 flex items-center justify-center gap-4 text-sm font-semibold">
            <span className="flex h-7 w-7 items-center justify-center rounded-full text-hint"><ChevronLeft className="h-4 w-4" /></span>
            {new Date().toLocaleDateString('en-US', { month: 'long', year: 'numeric' })}
            <span className="flex h-7 w-7 items-center justify-center rounded-full bg-primary-soft text-link"><ChevronRight className="h-4 w-4" /></span>
          </div>
          <div className="mt-3 grid grid-cols-7 gap-y-1 text-center">
            {WEEKDAYS.map((d) => (
              <div key={d} className="py-1 text-[9px] font-semibold text-muted-foreground">{d}</div>
            ))}
            {Array.from({ length: 21 }).map((_, i) => (
              <div key={i} className="flex items-center justify-center">
                <span
                  className={cn(
                    'flex h-8 w-8 items-center justify-center rounded-full text-xs tabular',
                    i === SELECTED_DAY && 'bg-primary font-bold text-primary-foreground',
                    i !== SELECTED_DAY && UNAVAILABLE.has(i) && 'text-hint',
                    i !== SELECTED_DAY && !UNAVAILABLE.has(i) && 'bg-primary-soft font-bold text-link',
                  )}
                >
                  {i + 1}
                </span>
              </div>
            ))}
          </div>
          <div className="mt-4 space-y-2">
            {TIMES.slice(1, 4).map((t, i) => (
              i + 1 === SELECTED_TIME ? (
                <div key={t} className="grid grid-cols-2 gap-2">
                  <div className="flex h-10 items-center justify-center rounded-lg bg-muted-foreground text-sm font-bold text-background tabular">{t}</div>
                  <div className="flex h-10 items-center justify-center rounded-lg bg-primary text-sm font-bold text-primary-foreground">Next</div>
                </div>
              ) : (
                <div key={t} className="flex h-10 items-center justify-center rounded-lg border border-primary/50 text-sm font-bold text-link tabular">{t}</div>
              )
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}

export default function Landing() {
  const { isAuthenticated, authChecked, user } = useAuth();
  const navigate = useNavigate();

  useEffect(() => {
    // Only redirect to dashboard if user is fully authenticated
    // AND the user object is present (meaning profile load started/finished)
    if (authChecked && isAuthenticated && user) {
      navigate('/dashboard', { replace: true });
    }
  }, [isAuthenticated, authChecked, user, navigate]);

  return (
    <div className="min-h-screen bg-card">
      {/* Nav */}
      <header className="sticky top-0 z-50 border-b border-border bg-card">
        <div className="max-w-6xl mx-auto flex h-16 items-center justify-between px-4 sm:px-6">
          <span className="sm:hidden"><Logo to="/" size="sm" /></span>
          <span className="hidden sm:block"><Logo to="/" /></span>
          <nav className="flex shrink-0 items-center gap-1 sm:gap-2" aria-label="Primary">
            <a href="#how" className="hidden md:block px-3 text-[15px] font-semibold text-foreground hover:text-link">How it works</a>
            <a href="#features" className="hidden md:block px-3 text-[15px] font-semibold text-foreground hover:text-link">Features</a>
            <Link to="/login" className="whitespace-nowrap px-1.5 sm:px-3 text-[15px] font-semibold text-foreground hover:text-link">Log in</Link>
            <Link to="/register"><GlassButton variant="primary" type="button" className="px-3.5 sm:px-5">Get started</GlassButton></Link>
          </nav>
        </div>
      </header>

      <main>
        {/* Hero: the promise on the left, the product doing it on the right */}
        <section className="relative overflow-hidden px-4 sm:px-6 pt-14 pb-20 sm:pt-20 lg:pb-28">
          <LogoMark size={620} tone="bg-brand-teal/15" className="pointer-events-none absolute -right-48 -top-6 hidden lg:block" />
          <div className="relative max-w-6xl mx-auto grid items-center gap-12 lg:grid-cols-[1fr_minmax(0,32rem)] lg:gap-14">
            <div>
              <h1 className="text-[2.75rem] leading-[1.05] sm:text-6xl lg:text-[4rem] font-bold tracking-[-0.03em]">
                <span className="sm:whitespace-nowrap">Schedule meetings.</span>
                <br />
                <span className="text-primary dark:text-link sm:whitespace-nowrap">Stay on WhatsApp.</span>
              </h1>
              <p className="mt-6 max-w-[34rem] text-lg sm:text-xl leading-relaxed text-muted-foreground">
                Share one booking link. Guests pick a time without signing up, and you confirm the meeting in a WhatsApp chat instead of an email thread.
              </p>
              <div className="mt-9 flex flex-col gap-3 sm:flex-row">
                <Link to="/register"><GlassButton variant="primary" size="lg" type="button" className="w-full sm:w-auto h-12 px-7 text-base">Get started, it's free <ArrowRight className="w-4 h-4" /></GlassButton></Link>
                <a href="#how"><GlassButton size="lg" type="button" className="w-full sm:w-auto h-12 px-7 text-base">How it works</GlassButton></a>
              </div>
              <ul className="mt-8 flex flex-wrap gap-x-6 gap-y-2 text-sm font-semibold text-muted-foreground">
                {['Free to use', 'No account for guests', 'Works with Google Calendar'].map((item) => (
                  <li key={item} className="flex items-center gap-2"><Check className="h-4 w-4 text-primary" strokeWidth={3} /> {item}</li>
                ))}
              </ul>
            </div>
            <BookingPreview />
          </div>
        </section>

        {/* How it works: a real sequence, so the steps are numbered */}
        <section id="how" className="scroll-mt-20 bg-background px-4 sm:px-6 py-20 lg:py-24">
          <div className="max-w-6xl mx-auto">
            <h2 className="max-w-xl text-3xl sm:text-[40px] leading-tight font-bold tracking-tight">From link to confirmed meeting in three steps</h2>
            <ol className="mt-12 grid gap-5 md:grid-cols-3">
              {STEPS.map((step, i) => (
                <li key={step.title} className="rounded-xl border border-border bg-card p-7 shadow-card">
                  <span className="flex h-9 w-9 items-center justify-center rounded-full bg-primary text-sm font-bold text-primary-foreground tabular">{i + 1}</span>
                  <h3 className="mt-5 text-xl font-bold">{step.title}</h3>
                  <p className="mt-2 text-[15px] leading-relaxed text-muted-foreground">{step.body}</p>
                </li>
              ))}
            </ol>
          </div>
        </section>

        {/* What's included: a scannable list, not a wall of equal cards */}
        <section id="features" className="scroll-mt-20 px-4 sm:px-6 py-20 lg:py-24">
          <div className="max-w-6xl mx-auto grid gap-12 lg:grid-cols-[minmax(0,22rem)_1fr] lg:gap-16">
            <div>
              <h2 className="text-3xl sm:text-[40px] leading-tight font-bold tracking-tight">What you get</h2>
              <p className="mt-4 text-lg leading-relaxed text-muted-foreground">
                Everything a booking page needs, built around the app your clients already answer.
              </p>
              <p className="mt-6 rounded-lg bg-primary-soft px-4 py-3 text-sm leading-relaxed text-foreground">
                <span className="font-bold text-link">Coming next:</span> automatic WhatsApp confirmations and reminders.
              </p>
            </div>
            <dl className="grid gap-x-10 sm:grid-cols-2">
              {FEATURES.map((f) => (
                <div key={f.title} className="border-t border-border py-6">
                  <dt className="flex items-center gap-2.5 text-[17px] font-bold"><Check className="h-4 w-4 shrink-0 text-primary" strokeWidth={3} /> {f.title}</dt>
                  <dd className="mt-2 pl-[26px] text-[15px] leading-relaxed text-muted-foreground">{f.body}</dd>
                </div>
              ))}
            </dl>
          </div>
        </section>

        {/* Closing call to action */}
        <section className="px-4 sm:px-6 pb-24">
          <div className="max-w-6xl mx-auto flex flex-col gap-8 rounded-2xl bg-brand-teal p-8 sm:p-12 md:flex-row md:items-center md:justify-between">
            <div>
              <h2 className="text-3xl sm:text-4xl font-bold tracking-tight text-brand-slate">You're one link away</h2>
              <p className="mt-3 max-w-lg text-lg leading-relaxed text-brand-ink">
                Create your booking page in minutes and share it in your next WhatsApp chat.
              </p>
            </div>
            <div className="flex shrink-0 flex-col gap-3 sm:flex-row">
              <Link to="/register" className="inline-flex w-full sm:w-auto h-12 items-center justify-center rounded-full px-7 text-base font-semibold bg-brand-slate text-white transition-all duration-200 hover:bg-brand-slate/90">Get started, it's free</Link>
              <Link to="/login" className="inline-flex w-full sm:w-auto h-12 items-center justify-center rounded-full border border-brand-ink px-7 text-base font-semibold text-brand-ink transition-all duration-200 hover:bg-brand-ink/10">Log in</Link>
            </div>
          </div>
        </section>
      </main>

      <footer className="border-t border-border bg-background px-4 sm:px-6 py-10">
        <div className="max-w-6xl mx-auto flex flex-col gap-4 text-sm text-muted-foreground sm:flex-row sm:items-center sm:justify-between">
          <div className="flex flex-wrap items-center gap-x-3 gap-y-1">
            <Logo size="sm" />
            <span>Schedule meetings. Stay on WhatsApp.</span>
          </div>
          <nav aria-label="Legal" className="flex items-center gap-5 font-semibold">
            <Link to="/privacy" className="transition-all duration-200 hover:text-link">Privacy Policy</Link>
            <Link to="/terms" className="transition-all duration-200 hover:text-link">Terms of Service</Link>
          </nav>
        </div>
      </footer>
    </div>
  );
}

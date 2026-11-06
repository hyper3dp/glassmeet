import React, { useEffect, useMemo, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { ArrowLeft, Clock, Copy, MessageCircle, Plus, QrCode, Share2, Video } from 'lucide-react';
import { cn } from '@/lib/utils';
import { api } from '@/lib/localApi';
import { GlassButton } from '@/components/glass';
import GoogleIcon from '@/components/googleicon.jsx';
import { useAuth } from '@/lib/Authcontext.jsx';
import Logo from '@/components/logo.jsx';
import { LEGAL } from '@/lib/legal';
import { DEFAULT_CONFIRMATION_TEMPLATE, fillTemplate } from '@/lib/whatsapp';

// Every line here describes something the app does today (see PRODUCT.md, "Promise only what ships").
const INCLUDED = [
  { title: 'One-on-one and group events', body: 'Cap how many people can join a session, or approve each booking before it is confirmed.' },
  { title: 'Google Calendar', body: 'Times you are already busy stay off your booking page, and new bookings land on your calendar.' },
  { title: 'Add to any calendar', body: 'After booking, guests get buttons for Google, Apple and Outlook, plus an .ics file.' },
  { title: 'Your own wording', body: 'Edit the WhatsApp confirmation so every message sounds like you wrote it.' },
];

const QUESTIONS = [
  { q: 'Is GlassMeet free?', a: 'Yes, it is free to use today. If paid features come later, we will tell you before anything is charged.' },
  { q: 'Do my guests need an account?', a: 'No. They open your link, pick a time, and leave their name, email and WhatsApp number.' },
  { q: 'Does GlassMeet send the WhatsApp messages for me?', a: 'Not yet. GlassMeet writes the message and opens the chat, and you press send from your own WhatsApp. Automatic confirmations and reminders are planned.' },
  { q: 'Which calendars does it work with?', a: 'You can connect Google Calendar. Guests can add their booking to Google, Apple or Outlook, or download an .ics file.' },
];

const WEEKDAYS = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
const SAMPLE_TIMES = ['9:30 AM', '10:00 AM', '11:30 AM', '2:00 PM'];
const SAMPLE_HOST = 'Sara Ahmed';
const SAMPLE_GUEST = 'Omar';

// the sample shows weekdays in the current month, or the next one when this month is nearly over
function sampleMonth(today) {
  const weekdaysLeft = (first) => {
    const days = [];
    for (let d = new Date(first); d.getMonth() === first.getMonth(); d.setDate(d.getDate() + 1)) {
      if (d >= today && d.getDay() % 6 !== 0) days.push(d.getDate());
    }
    return days;
  };
  const thisMonth = new Date(today.getFullYear(), today.getMonth(), 1);
  const nextMonth = new Date(today.getFullYear(), today.getMonth() + 1, 1);
  const first = weekdaysLeft(thisMonth).length >= 5 ? thisMonth : nextMonth;
  return { first, open: new Set(weekdaysLeft(first)) };
}

// A sample of the guest booking page that works like the real one and ends in the real default
// confirmation message. It saves nothing, and says so.
function SampleBooking() {
  const [today] = useState(() => { const d = new Date(); d.setHours(0, 0, 0, 0); return d; });
  const { first, open } = useMemo(() => sampleMonth(today), [today]);
  const [day, setDay] = useState(() => [...open][1] ?? [...open][0]);
  const [time, setTime] = useState(null);
  const [booked, setBooked] = useState(false);

  const blanks = first.getDay();
  const count = new Date(first.getFullYear(), first.getMonth() + 1, 0).getDate();
  const picked = new Date(first.getFullYear(), first.getMonth(), day);
  const dayLabel = picked.toLocaleDateString('en-US', { weekday: 'long', month: 'long', day: 'numeric' });
  const message = fillTemplate(DEFAULT_CONFIRMATION_TEMPLATE, {
    guestName: SAMPLE_GUEST, hostName: SAMPLE_HOST, date: dayLabel, time, duration: '30 min', timezone: 'Dubai',
  });

  return (
    <div>
      <div className="overflow-hidden rounded-xl border border-border bg-card shadow-pop">
        <div className="grid sm:grid-cols-[13rem_1fr]">
          <div className="border-b border-border p-5 sm:border-r sm:border-b-0">
            <p className="text-sm font-semibold text-muted-foreground">{SAMPLE_HOST}</p>
            <p className="mt-1 text-xl font-bold leading-snug">30 minute consultation</p>
            <ul className="mt-4 space-y-2.5 text-sm font-medium text-muted-foreground">
              <li className="flex items-center gap-2"><Clock className="h-4 w-4 shrink-0" /> 30 min</li>
              <li className="flex items-center gap-2"><Video className="h-4 w-4 shrink-0" /> Video call</li>
              <li className="flex items-center gap-2"><MessageCircle className="h-4 w-4 shrink-0" /> Confirmed on WhatsApp</li>
            </ul>
          </div>

          {booked ? (
            <div className="flex min-h-[28rem] flex-col p-5 animate-fade-in max-sm:min-h-[31rem]" role="status">
              <p className="text-base font-bold">The host gets this, ready to send</p>
              <p className="mt-1 text-sm text-muted-foreground">One tap opens the chat with {SAMPLE_GUEST}.</p>
              <div className="mt-4 whitespace-pre-line rounded-lg rounded-tr-none bg-wa-bubble px-3.5 py-3 text-sm leading-relaxed text-foreground">{message}</div>
              <button type="button" onClick={() => { setBooked(false); setTime(null); }} className="mt-auto inline-flex h-10 items-center gap-1.5 self-start pt-3 text-sm font-semibold text-link hover:underline">
                <ArrowLeft className="h-4 w-4" /> Try another time
              </button>
            </div>
          ) : (
            <div className="min-h-[28rem] p-5 max-sm:min-h-[31rem]">
              <p className="text-base font-bold">Select a date and time</p>
              <p className="mt-3 text-center text-sm font-semibold">{first.toLocaleDateString('en-US', { month: 'long', year: 'numeric' })}</p>
              <div className="mt-2 grid grid-cols-7 text-center">
                {WEEKDAYS.map((d) => <div key={d} className="py-1 text-[11px] font-semibold text-muted-foreground">{d}</div>)}
                {Array.from({ length: blanks }).map((_, i) => <div key={`b${i}`} />)}
                {Array.from({ length: count }).map((_, i) => {
                  const n = i + 1;
                  const isOpen = open.has(n);
                  const selected = n === day;
                  return (
                    <div key={n} className="flex justify-center py-0.5">
                      <button
                        type="button"
                        disabled={!isOpen}
                        aria-pressed={selected}
                        aria-label={new Date(first.getFullYear(), first.getMonth(), n).toLocaleDateString('en-US', { weekday: 'long', month: 'long', day: 'numeric' })}
                        onClick={() => { setDay(n); setTime(null); }}
                        className={cn(
                          'h-10 w-10 rounded-full text-[13px] tabular transition-all duration-200 sm:h-8 sm:w-8',
                          selected && 'bg-primary font-bold text-primary-foreground',
                          !selected && isOpen && 'bg-primary-soft font-bold text-link hover:brightness-95',
                          !isOpen && 'cursor-default text-hint',
                        )}
                      >
                        {n}
                      </button>
                    </div>
                  );
                })}
              </div>
              <div className="mt-3 grid grid-cols-2 gap-2">
                {SAMPLE_TIMES.map((t) => (t === time ? (
                  <button key={t} type="button" onClick={() => setBooked(true)} aria-label={`Next: book ${t}`} className="h-10 rounded-lg bg-primary text-sm font-bold text-primary-foreground transition-all duration-200 hover:bg-primary-hover"><span className="tabular">{t}</span> · Next</button>
                ) : (
                  <button key={t} type="button" onClick={() => setTime(t)} className="h-10 rounded-lg border border-input text-sm font-bold text-link tabular transition-all duration-200 hover:border-primary">{t}</button>
                )))}
              </div>
            </div>
          )}
        </div>
      </div>
      <p className="mt-3 text-center text-sm text-muted-foreground">A sample booking page. Try it; nothing gets booked.</p>
    </div>
  );
}

// Drawn from the real screens, sample data. Decorative: the text beside each one says the same.
function HoursShot() {
  const rows = [['Mon', '9:00 AM – 5:00 PM'], ['Tue', '9:00 AM – 5:00 PM'], ['Wed', '9:00 AM – 1:00 PM'], ['Thu', '9:00 AM – 5:00 PM'], ['Fri', 'Unavailable']];
  return (
    <div className="rounded-xl border border-border bg-card p-5 shadow-card sm:p-6" aria-hidden="true">
      <p className="font-bold">Weekly hours</p>
      <ul className="mt-3 divide-y divide-border text-sm">
        {rows.map(([d, h]) => (
          <li key={d} className="flex items-center justify-between py-2.5">
            <span className="font-semibold">{d}</span>
            <span className={cn('tabular', h === 'Unavailable' ? 'text-hint' : 'text-muted-foreground')}>{h}</span>
          </li>
        ))}
      </ul>
      <p className="mt-5 font-bold">Date overrides</p>
      <p className="mt-2 flex items-center justify-between rounded-lg bg-secondary px-3 py-2.5 text-sm">
        <span className="font-semibold">Thu, Dec 24</span>
        <span className="text-muted-foreground">Closed</span>
      </p>
    </div>
  );
}

function ShareShot() {
  return (
    <div className="rounded-xl border border-border bg-card p-5 shadow-card sm:p-6" aria-hidden="true">
      <div className="ml-auto max-w-[85%] rounded-lg rounded-tr-none bg-wa-bubble px-3.5 py-3 text-sm leading-relaxed">
        Here is my booking page. Pick any time that suits you.
        <span className="mt-1 block truncate font-semibold text-link">glassmeet.run.place/book/1941f2b9</span>
      </div>
      <div className="mt-5 flex flex-wrap gap-2 border-t border-border pt-5 text-sm font-semibold">
        <span className="inline-flex h-9 items-center gap-1.5 rounded-full border border-input px-3.5"><Copy className="h-4 w-4" /> Copy link</span>
        <span className="inline-flex h-9 items-center gap-1.5 rounded-full border border-input px-3.5"><Share2 className="h-4 w-4" /> Share</span>
        <span className="inline-flex h-9 items-center gap-1.5 rounded-full border border-input px-3.5"><QrCode className="h-4 w-4" /> QR code</span>
      </div>
    </div>
  );
}

function ConfirmShot() {
  const rows = [['Guest', 'Omar Khalil'], ['When', 'Tue, 10:00 AM'], ['WhatsApp', '+971 50 ••• ••••']];
  return (
    <div className="rounded-xl border border-border bg-card p-5 shadow-card sm:p-6" aria-hidden="true">
      <p className="font-bold">30 minute consultation</p>
      <dl className="mt-3 divide-y divide-border text-sm">
        {rows.map(([k, v]) => (
          <div key={k} className="flex items-center justify-between py-2.5">
            <dt className="text-muted-foreground">{k}</dt>
            <dd className="font-semibold tabular">{v}</dd>
          </div>
        ))}
      </dl>
      <span className="mt-4 flex h-11 items-center justify-center gap-2 rounded-full bg-primary text-sm font-semibold text-primary-foreground">
        <MessageCircle className="h-4 w-4" /> Send on WhatsApp
      </span>
    </div>
  );
}

// Heading and text beside a framed product shot; every other row swaps sides on desktop
function ProductRow({ title, body, shot, flip }) {
  return (
    <div className="grid items-center gap-8 lg:grid-cols-2 lg:gap-20">
      <div className={cn(flip && 'lg:order-2')}>
        <h3 className="text-2xl font-bold sm:text-3xl">{title}</h3>
        <p className="mt-3 max-w-[30rem] text-lg leading-relaxed text-muted-foreground">{body}</p>
      </div>
      <figure className="rounded-2xl bg-secondary p-5 sm:p-10">
        {shot}
        <figcaption className="mt-3 text-center text-xs text-muted-foreground">Sample data</figcaption>
      </figure>
    </div>
  );
}

export default function Landing() {
  const { isAuthenticated, authChecked, user } = useAuth();
  const navigate = useNavigate();
  const [signUpError, setSignUpError] = useState('');

  // just deleted their account in Settings
  useEffect(() => {
    try {
      if (sessionStorage.getItem('gm-account-deleted')) {
        sessionStorage.removeItem('gm-account-deleted');
        // sonner loads only when needed, keeping it off the landing page's first load
        import('sonner').then(({ toast }) => toast.success('Your account and all its data were deleted.'));
      }
    } catch { /* storage unavailable */ }
  }, []);

  useEffect(() => {
    // Only redirect to dashboard if user is fully authenticated
    // AND the user object is present (meaning profile load started/finished)
    if (authChecked && isAuthenticated && user) {
      navigate('/dashboard', { replace: true });
    }
  }, [isAuthenticated, authChecked, user, navigate]);

  const signUpWithGoogle = () => {
    setSignUpError('');
    api.auth.loginWithGoogle('/dashboard').catch(() => setSignUpError('Google sign-up didn’t start. Try again, or sign up with email.'));
  };

  return (
    <div className="min-h-screen bg-background">
      <header className="sticky top-0 z-50 border-b border-border bg-background px-4 sm:px-6">
        <div className="mx-auto flex h-16 max-w-6xl items-center justify-between">
          <span className="sm:hidden"><Logo to="/" size="sm" /></span>
          <span className="hidden sm:block"><Logo to="/" /></span>
          <nav className="flex shrink-0 items-center gap-1 sm:gap-2" aria-label="Primary">
            <a href="#how" className="hidden px-3 text-[15px] font-semibold text-foreground hover:text-link md:block">How it works</a>
            <a href="#questions" className="hidden px-3 text-[15px] font-semibold text-foreground hover:text-link md:block">Questions</a>
            <Link to="/login" className="whitespace-nowrap px-1.5 text-[15px] font-semibold text-foreground hover:text-link sm:px-3">Log in</Link>
            <GlassButton as={Link} to="/register" variant="primary" className="px-3.5 sm:px-5">Sign up</GlassButton>
          </nav>
        </div>
      </header>

      <main>
        <section className="px-4 pb-16 pt-12 sm:px-6 sm:pt-16 lg:pb-24 lg:pt-20">
          <div className="mx-auto grid max-w-6xl items-center gap-12 lg:grid-cols-[1fr_minmax(0,34rem)] lg:gap-10 xl:gap-12">
            <div>
              <h1 className="text-[2.375rem] font-bold leading-[1.08] tracking-[-0.025em] sm:text-[2.75rem] xl:text-6xl">
                <span className="block">Schedule meetings.</span>
                <span className="block">Stay on WhatsApp.</span>
              </h1>
              <p className="mt-6 max-w-[30rem] text-lg leading-relaxed text-muted-foreground sm:text-xl">
                Send people one link. They pick a time without making an account, and you confirm it in a WhatsApp chat.
              </p>
              <div className="mt-8 flex max-w-[30rem] flex-col gap-3 sm:flex-row">
                <GlassButton type="button" variant="primary" size="lg" onClick={signUpWithGoogle} className="h-12 w-full px-6 text-base sm:w-auto">
                  <span className="flex h-6 w-6 items-center justify-center rounded-full bg-white"><GoogleIcon className="h-4 w-4" /></span>
                  Sign up with Google
                </GlassButton>
                <GlassButton as={Link} to="/register" size="lg" className="h-12 w-full px-6 text-base sm:w-auto">Sign up with email</GlassButton>
              </div>
              {signUpError && <p role="alert" className="mt-3 text-sm text-destructive">{signUpError}</p>}
              <p className="mt-4 max-w-[30rem] text-sm leading-relaxed text-muted-foreground">
                Free to use. By signing up, you agree to our <Link to="/terms" className="font-semibold text-link hover:underline">Terms</Link> and <Link to="/privacy" className="font-semibold text-link hover:underline">Privacy Policy</Link>.
              </p>
            </div>
            <SampleBooking />
          </div>
        </section>

        <section id="how" className="scroll-mt-16 border-t border-border px-4 py-16 sm:px-6 lg:py-24">
          <div className="mx-auto max-w-6xl">
            <h2 className="max-w-2xl text-3xl font-bold leading-tight sm:text-[2.25rem] xl:text-[2.5rem]">From a link to a confirmed meeting</h2>
            <div className="mt-12 space-y-14 lg:mt-16 lg:space-y-20">
              <ProductRow
                title="Set the hours you take meetings"
                body="Add your weekly availability, then close or open single dates without touching the rest of your week."
                shot={<HoursShot />}
              />
              <ProductRow
                flip
                title="Share one link"
                body="Send your booking page in a WhatsApp chat, paste the link anywhere, or let people scan its QR code."
                shot={<ShareShot />}
              />
              <ProductRow
                title="Confirm it in the chat"
                body="When someone books, GlassMeet writes the confirmation. Open the chat with your guest and press send."
                shot={<ConfirmShot />}
              />
            </div>
          </div>
        </section>

        <section className="border-t border-border bg-secondary px-4 py-16 sm:px-6 lg:py-20">
          <div className="mx-auto grid max-w-6xl gap-8 lg:grid-cols-[1fr_2fr] lg:gap-20">
            <h2 className="text-3xl font-bold leading-tight sm:text-[2.25rem] xl:text-[2.5rem]">Also included</h2>
            <dl className="grid gap-x-12 gap-y-8 sm:grid-cols-2">
              {INCLUDED.map((item) => (
                <div key={item.title}>
                  <dt className="text-[17px] font-bold">{item.title}</dt>
                  <dd className="mt-1.5 text-[15px] leading-relaxed text-muted-foreground">{item.body}</dd>
                </div>
              ))}
            </dl>
          </div>
        </section>

        <section id="questions" className="scroll-mt-16 px-4 py-16 sm:px-6 lg:py-24">
          <div className="mx-auto grid max-w-6xl gap-8 lg:grid-cols-[1fr_2fr] lg:gap-20">
            <h2 className="text-3xl font-bold leading-tight sm:text-[2.25rem] xl:text-[2.5rem]">Questions</h2>
            <div className="divide-y divide-border border-y border-border">
              {QUESTIONS.map(({ q, a }) => (
                <details key={q} className="group">
                  <summary className="flex min-h-14 cursor-pointer list-none items-center justify-between gap-4 py-4 text-[17px] font-semibold transition-all duration-200 hover:text-link [&::-webkit-details-marker]:hidden">
                    {q}
                    <Plus aria-hidden="true" className="h-5 w-5 shrink-0 text-muted-foreground transition-all duration-200 group-open:rotate-45" />
                  </summary>
                  <p className="max-w-[60ch] pb-5 text-[15px] leading-relaxed text-muted-foreground">{a}</p>
                </details>
              ))}
            </div>
          </div>
        </section>

        <section className="bg-primary px-4 py-14 text-primary-foreground sm:px-6 lg:py-20 dark:bg-secondary dark:text-foreground">
          <div className="mx-auto flex max-w-6xl flex-col gap-7 md:flex-row md:items-center md:justify-between">
            <div>
              <h2 className="text-3xl font-bold leading-tight text-primary-foreground dark:text-foreground sm:text-[2.25rem] xl:text-[2.5rem]">Set up your booking link</h2>
              <p className="mt-2 text-lg">It takes a few minutes, and your guests never need an account.</p>
            </div>
            <Link to="/register" className="inline-flex h-12 shrink-0 items-center justify-center rounded-full bg-primary-foreground px-7 text-base font-semibold text-primary transition-all duration-200 hover:opacity-90 dark:bg-primary dark:text-primary-foreground">Sign up</Link>
          </div>
        </section>
      </main>

      <footer className="px-4 py-10 sm:px-6">
        <div className="mx-auto flex max-w-6xl flex-col gap-6 text-sm text-muted-foreground sm:flex-row sm:items-center sm:justify-between">
          <div className="flex flex-wrap items-center gap-x-4 gap-y-2">
            <Logo size="sm" />
            <span>© {new Date().getFullYear()} {LEGAL.operator}</span>
          </div>
          <nav aria-label="Legal" className="flex flex-wrap items-center gap-x-6 gap-y-2 font-semibold">
            <Link to="/privacy" className="transition-all duration-200 hover:text-link">Privacy Policy</Link>
            <Link to="/terms" className="transition-all duration-200 hover:text-link">Terms of Service</Link>
          </nav>
        </div>
      </footer>
    </div>
  );
}

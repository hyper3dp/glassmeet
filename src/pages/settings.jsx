import React, { useEffect, useRef, useState } from 'react';
import { User, Globe, Clock, Upload, Loader2, Trash2, Plug, MapPin, Smartphone, Sparkles, FlaskConical, KeyRound } from 'lucide-react';
import { useNavigate } from 'react-router-dom';
import { toast } from 'sonner';
import { GlassButton, GlassInput, GlassTextarea, GlassLabel, GlassSelect, Spinner, PageHeader, Avatar, SaveStatus } from '@/components/glass';
import { COMMON_TIMEZONES, detectTimezone } from '@/lib/Availability.js';
import { api } from '@/lib/localApi';
import { useAutosave } from '@/lib/useAutosave';
import OutlookIcon from '@/components/outlookicon.jsx';
import GoogleIcon from '@/components/googleicon.jsx';
import AddressManager from '@/components/AddressManager.jsx';
import { Switch } from '@/components/ui/switch';
import { BETA_FEATURES, useBeta, unlockBeta, hideBeta, setBetaFeature } from '@/lib/beta';
import { Dialog, DialogContent, DialogTitle } from '@/components/ui/dialog';
import { appPath } from '@/lib/authReturnTo';

const SECTIONS = [
  { id: 'profile', label: 'Profile', icon: User },
  { id: 'timezone', label: 'Time zone', icon: Globe },
  { id: 'addresses', label: 'Addresses', icon: MapPin },
  { id: 'coming-soon', label: 'Coming soon', icon: Plug },
];
const BETA_SECTION = { id: 'beta', label: 'Beta features', icon: FlaskConical };
const DELETE_SECTION = { id: 'delete-account', label: 'Delete account', icon: Trash2 };
const UNLOCK_TAPS = 5;

const MAX_PHOTO_MB = 5;
const PHOTO_TYPES = ['image/jpeg', 'image/png', 'image/webp', 'image/gif'];

export default function Settings({ profile, updateProfile }) {
  const [form, setForm] = useState(null);
  const formRef = useRef(form);
  formRef.current = form;
  const mounted = useRef(true);
  useEffect(() => () => { mounted.current = false; }, []);
  const [activeSection, setActiveSection] = useState(SECTIONS[0].id);
  const [uploading, setUploading] = useState(false);
  const [photoError, setPhotoError] = useState('');
  const fileRef = useRef(null);
  const beta = useBeta();
  const sections = [...SECTIONS, ...(beta?.unlocked ? [BETA_SECTION] : []), DELETE_SECTION];

  // Five quick taps on "Coming soon" open the hidden Beta features menu
  const taps = useRef({ count: 0, at: 0 });
  const tapComingSoon = () => {
    if (beta?.unlocked) return;
    const now = Date.now();
    taps.current = { count: now - taps.current.at < 1500 ? taps.current.count + 1 : 1, at: now };
    if (taps.current.count < UNLOCK_TAPS) return;
    unlockBeta();
    toast.success('Beta features unlocked');
    setTimeout(() => document.getElementById(BETA_SECTION.id)?.scrollIntoView({ behavior: 'smooth', block: 'start' }), 50);
  };

  useEffect(() => {
    if (profile && !form) {
      setForm({
        full_name: profile.full_name || '',
        profile_photo: profile.profile_photo || '',
        whatsapp_number: profile.whatsapp_number || '',
        timezone: profile.timezone || detectTimezone(),
        bio: profile.bio || '',
        username: profile.username || '',
      });
    }
  }, [profile]);

  // Booking pages read the host's zone, name and photo from each event type (guests can't read
  // profiles), so changes to them are copied onto the host's event types too.
  const savedHost = useRef({ host_timezone: profile?.timezone || null, host_name: profile?.full_name || null, host_photo: profile?.profile_photo || null });
  const save = async (value) => {
    try {
      await updateProfile({ ...value, username: value.username.trim() || null });
    } catch (e) {
      throw /duplicate key|unique/i.test(e?.message || '') && /username/i.test(e.message) ? new Error('that username is taken') : e;
    }
    const host = { host_timezone: value.timezone || null, host_name: value.full_name.trim() || null, host_photo: value.profile_photo || null };
    const changed = Object.fromEntries(Object.entries(host).filter(([k, v]) => v !== savedHost.current[k] && (v || k !== 'host_timezone')));
    if (Object.keys(changed).length) {
      // one request for all of them, not one per event type
      const events = await api.entities.EventType.filter({ created_by_id: profile.id }, undefined, undefined, 'id');
      if (events.length) await api.entities.EventType.bulkUpdate(events.map((e) => ({ id: e.id, value: changed })));
      savedHost.current = { ...savedHost.current, ...changed };
    }
  };
  const autosave = useAutosave(form, save, { enabled: !!form, delay: 900 });

  useEffect(() => {
    if (!form) return undefined;
    const observer = new IntersectionObserver((entries) => {
      const visible = entries.filter((e) => e.isIntersecting).sort((a, b) => a.boundingClientRect.top - b.boundingClientRect.top)[0];
      if (visible) setActiveSection(visible.target.id);
    }, { rootMargin: '-80px 0px -55% 0px' });
    sections.forEach((s) => { const el = document.getElementById(s.id); if (el) observer.observe(el); });
    return () => observer.disconnect();
  }, [!!form, sections.length]);

  if (!form) return <div className="flex justify-center py-24"><Spinner /></div>;

  const set = (k, v) => setForm((f) => ({ ...f, [k]: v }));

  const onPickPhoto = async (e) => {
    const file = e.target.files?.[0];
    e.target.value = '';
    if (!file) return;
    setPhotoError('');
    // the avatars bucket takes only these (HEIC, SVG, AVIF... would fail with a raw server error)
    if (!PHOTO_TYPES.includes(file.type)) { setPhotoError('Choose an image file (JPG, PNG or WebP).'); return; }
    if (file.size > MAX_PHOTO_MB * 1024 * 1024) { setPhotoError(`Choose an image under ${MAX_PHOTO_MB} MB.`); return; }
    setUploading(true);
    try {
      const url = await api.storage.uploadAvatar(file);
      // left the page while it uploaded: save the photo directly, as autosave has stopped
      if (!mounted.current) { save({ ...formRef.current, profile_photo: url }).catch(() => {}); return; }
      set('profile_photo', url);
    } catch (err) {
      setPhotoError(`Upload failed: ${err.message}`);
    }
    setUploading(false);
  };

  return (
    <div className="animate-fade-in">
      <PageHeader title="Account settings" description="Changes save automatically." actions={<SaveStatus state={autosave.state} error={autosave.error} onRetry={autosave.retry} />} />

      <div className="grid gap-8 lg:grid-cols-[200px_1fr]">
        <nav className="hidden lg:block" aria-label="Settings sections">
          <ul className="sticky top-24 space-y-0.5">
            {sections.map((s) => (
              <li key={s.id}>
                <a href={`#${s.id}`} onClick={s.id === 'coming-soon' ? tapComingSoon : undefined} aria-current={activeSection === s.id ? 'true' : undefined} className={`glass-nav-item flex items-center gap-3 rounded-lg px-3 h-10 text-sm font-semibold text-foreground ${activeSection === s.id ? 'active' : ''}`}>
                  <s.icon className="w-4 h-4 opacity-70" /> {s.label}
                </a>
              </li>
            ))}
          </ul>
        </nav>

        <div className="max-w-2xl space-y-6">
          {/* Profile */}
          <Section id="profile" title="Profile" description="How you appear on booking pages.">
            <div className="flex flex-wrap items-center gap-5 mb-6">
              <Avatar src={form.profile_photo} name={form.full_name} size={72} />
              <div className="flex flex-wrap items-center gap-2">
                <input ref={fileRef} type="file" accept="image/png,image/jpeg,image/webp,image/gif" className="sr-only" onChange={onPickPhoto} aria-label="Upload profile photo" />
                <GlassButton type="button" onClick={() => fileRef.current?.click()} disabled={uploading}>
                  {uploading ? <Loader2 className="w-4 h-4 animate-spin" /> : <Upload className="w-4 h-4" />} {form.profile_photo ? 'Change photo' : 'Upload photo'}
                </GlassButton>
                {form.profile_photo && (
                  <GlassButton type="button" variant="ghost" onClick={() => set('profile_photo', '')} disabled={uploading}>
                    <Trash2 className="w-4 h-4" /> Remove
                  </GlassButton>
                )}
                <p className="basis-full text-xs text-muted-foreground">JPG, PNG or WebP, up to {MAX_PHOTO_MB} MB.</p>
                {photoError && <p role="alert" className="basis-full text-sm text-destructive">{photoError}</p>}
              </div>
            </div>
            <div className="grid sm:grid-cols-2 gap-5">
              <div>
                <GlassLabel htmlFor="s-name">Name</GlassLabel>
                <GlassInput id="s-name" maxLength={80} value={form.full_name} onChange={(e) => set('full_name', e.target.value)} />
              </div>
              <div>
                <GlassLabel htmlFor="s-user">Public username</GlassLabel>
                <GlassInput id="s-user" maxLength={40} aria-describedby="s-user-hint" value={form.username} onChange={(e) => set('username', e.target.value.toLowerCase().replace(/[^a-z0-9_]/g, ''))} />
                <p id="s-user-hint" className="mt-1.5 text-xs text-muted-foreground">Reserved for your profile link, coming soon. Guests book through each event type’s link for now.</p>
              </div>
              <div>
                <GlassLabel htmlFor="s-email">Email</GlassLabel>
                <GlassInput id="s-email" value={profile.email || ''} disabled />
              </div>
              <div>
                <GlassLabel htmlFor="s-password">Password</GlassLabel>
                <ResetPassword email={profile.email} />
              </div>
              <div>
                <GlassLabel htmlFor="s-wa">WhatsApp number</GlassLabel>
                <GlassInput id="s-wa" type="tel" inputMode="tel" value={form.whatsapp_number} onChange={(e) => set('whatsapp_number', e.target.value)} placeholder="+971 50 123 4567" />
              </div>
            </div>
            <div className="mt-5">
              <GlassLabel htmlFor="s-bio">Welcome message</GlassLabel>
              <GlassTextarea id="s-bio" rows={3} maxLength={300} value={form.bio} onChange={(e) => set('bio', e.target.value)} placeholder="A short intro shown on your booking page." />
            </div>
          </Section>

          {/* Time zone */}
          <Section id="timezone" title="Time zone" description="Used for your availability and every booking.">
            <GlassLabel htmlFor="s-tz">Time zone</GlassLabel>
            <GlassSelect id="s-tz" value={form.timezone} onChange={(e) => set('timezone', e.target.value)}>
              {!COMMON_TIMEZONES.includes(form.timezone) && <option value={form.timezone}>{form.timezone}</option>}
              {COMMON_TIMEZONES.map((tz) => <option key={tz} value={tz}>{tz}</option>)}
            </GlassSelect>
          </Section>

          {/* Addresses */}
          <Section id="addresses" title="Addresses" description="Places you meet guests. Pick one when an event type is in person.">
            <AddressManager />
          </Section>

          {/* Coming soon */}
          <Section id="coming-soon" title="Coming soon" onTitleClick={tapComingSoon} description="Features and integrations we're building next.">
            <ul className="divide-y divide-border rounded-lg border border-border">
              <ComingSoonRow
                icon={<span className="w-10 h-10 rounded-lg bg-primary text-primary-foreground flex items-center justify-center"><Smartphone className="w-5 h-5" /></span>}
                name="GlassMeet for iPhone and iPad"
                body="A native app to manage bookings, availability and WhatsApp confirmations on the go."
              />
              <ComingSoonRow
                icon={<span className="w-10 h-10 rounded-lg bg-primary-soft text-link flex items-center justify-center"><Sparkles className="w-5 h-5" /></span>}
                name="GlassMeet AI assistant"
                body="An AI agent that helps you plan: finds good times, suggests your week's schedule and drafts messages to guests."
              />
              <ComingSoonRow
                icon={<span className="w-10 h-10 rounded-lg bg-[#635BFF] text-white text-lg font-bold flex items-center justify-center">S</span>}
                name="Stripe"
                body="Take payment when guests book paid meetings."
              />
              <ComingSoonRow
                icon={<span className="w-10 h-10 rounded-lg border border-border bg-white flex items-center justify-center"><GoogleIcon className="w-5 h-5" /></span>}
                name="Google Calendar"
                body="Hide busy times from your booking page and add new bookings to your calendar."
              />
              <ComingSoonRow
                icon={<span className="w-10 h-10 rounded-lg bg-[#0078D4] flex items-center justify-center"><OutlookIcon className="w-6 h-6" /></span>}
                name="Microsoft Outlook"
                body="Connect a Microsoft 365 or Outlook.com calendar for availability and sync."
              />
            </ul>
            <p className="mt-3 text-sm text-muted-foreground">Until then, subscribe to your GlassMeet calendar from the Calendars page to see bookings in any calendar app.</p>
          </Section>

          {/* Beta features: hidden until unlocked from Coming soon */}
          {beta?.unlocked && (
            <Section id={BETA_SECTION.id} title="Beta features" description="Early features we're still testing. They may change or break. Turning one off only hides it for you on this browser.">
              <ul className="divide-y divide-border rounded-lg border border-border">
                {BETA_FEATURES.map((f) => (
                  <li key={f.id}>
                    <label htmlFor={`beta-${f.id}`} className="flex items-start justify-between gap-4 p-4 cursor-pointer">
                      <span className="min-w-0">
                        <span className="flex flex-wrap items-center gap-2">
                          <span className="text-sm font-bold">{f.name}</span>
                          <span className="px-2 py-0.5 rounded-full text-xs font-semibold bg-primary-soft text-link">Beta</span>
                        </span>
                        <span className="mt-0.5 block text-sm text-muted-foreground">{f.body}</span>
                      </span>
                      <Switch id={`beta-${f.id}`} checked={!!beta[f.id]} onCheckedChange={(on) => setBetaFeature(f.id, on)} className="mt-0.5" />
                    </label>
                  </li>
                ))}
              </ul>
              <GlassButton type="button" variant="ghost" size="sm" className="mt-3" onClick={hideBeta}>Hide beta features</GlassButton>
            </Section>
          )}

          <Section id={DELETE_SECTION.id} title="Delete account" description="Permanently delete your GlassMeet account and everything in it. This can’t be undone.">
            <DeleteAccount email={profile.email} />
          </Section>
        </div>
      </div>
    </div>
  );
}

// Deletes the account after the host types DELETE. Everything goes: event types, hours, meetings,
// notifications, templates, addresses, WhatsApp settings, calendar-feed links and photos.
// emails a code, then the reset page takes it with the new password and comes back here. Also
// sets a first password for hosts who signed up with Google or LinkedIn.
function ResetPassword({ email }) {
  const navigate = useNavigate();
  const [sending, setSending] = useState(false);
  const send = async () => {
    if (sending || !email) return;
    setSending(true);
    try {
      await api.auth.resetPasswordRequest(email);
      navigate(`/reset-password?${new URLSearchParams({ email, returnTo: '/settings' })}`);
    } catch (err) {
      toast.error(/fetch|network/i.test(err.message || '') ? 'Couldn’t reach GlassMeet. Check your connection and try again.' : `Couldn’t send the code. ${err.message || ''}`.trim());
      setSending(false);
    }
  };
  return (
    <>
      <GlassButton id="s-password" type="button" onClick={send} disabled={sending || !email} aria-describedby="s-password-hint">
        {sending ? <Loader2 className="w-4 h-4 animate-spin" /> : <KeyRound className="w-4 h-4" />} {sending ? 'Sending code…' : 'Reset password'}
      </GlassButton>
      <p id="s-password-hint" className="mt-1.5 text-xs text-muted-foreground">We’ll email you a code to set a new one.</p>
    </>
  );
}

function DeleteAccount({ email }) {
  const [open, setOpen] = useState(false);
  const [typed, setTyped] = useState('');
  const [deleting, setDeleting] = useState(false);
  const [error, setError] = useState('');
  const confirmed = typed.trim().toUpperCase() === 'DELETE';

  const close = () => { if (!deleting) { setOpen(false); setTyped(''); setError(''); } };
  const remove = async (e) => {
    e.preventDefault();
    if (!confirmed) return;
    setDeleting(true);
    setError('');
    try {
      await api.auth.deleteAccount();
      try { sessionStorage.setItem('gm-account-deleted', '1'); } catch { /* storage unavailable */ }
      window.location.assign(appPath('/'));
    } catch (err) {
      setError(err?.message || 'Your account couldn’t be deleted. Try again.');
      setDeleting(false);
    }
  };

  return (
    <>
      <GlassButton type="button" variant="danger" onClick={() => setOpen(true)}><Trash2 className="w-4 h-4" /> Delete account</GlassButton>
      {open && (
        <Dialog open onOpenChange={(next) => { if (!next) close(); }}>
          <DialogContent showCloseButton={false} className="sm:max-w-md p-6 block">
            <DialogTitle>Delete your account?</DialogTitle>
            <form onSubmit={remove}>
              <p className="mt-2 text-sm text-muted-foreground">
                This permanently deletes {email ? <span className="font-semibold text-foreground">{email}</span> : 'your account'} and all its data:
              </p>
              <ul className="mt-2 list-disc pl-5 text-sm text-muted-foreground space-y-0.5">
                <li>your event types, and their booking links stop working</li>
                <li>your hours, days off and holiday settings</li>
                <li>every meeting booked with you, with your guests’ details</li>
                <li>notifications, templates, addresses, WhatsApp settings and your photo</li>
                <li>calendar subscriptions, which stop updating</li>
              </ul>
              <p className="mt-3 text-sm text-muted-foreground">Guests aren’t told. Cancel or message anyone with an upcoming meeting first.</p>
              <GlassLabel htmlFor="delete-confirm" className="mt-5">Type DELETE to confirm</GlassLabel>
              <GlassInput id="delete-confirm" autoComplete="off" value={typed} onChange={(e) => setTyped(e.target.value)} disabled={deleting} />
              {error && <p role="alert" className="mt-3 text-sm text-destructive">{error}</p>}
              <div className="mt-6 flex justify-end gap-2">
                <GlassButton type="button" variant="ghost" onClick={close} disabled={deleting}>Keep my account</GlassButton>
                <GlassButton type="submit" variant="danger" disabled={!confirmed || deleting}>
                  {deleting ? <><Loader2 className="w-4 h-4 animate-spin" /> Deleting…</> : 'Delete everything'}
                </GlassButton>
              </div>
            </form>
          </DialogContent>
        </Dialog>
      )}
    </>
  );
}

function Section({ id, title, description, onTitleClick, children }) {
  return (
    <section id={id} className="scroll-mt-24 rounded-xl border border-border bg-card shadow-card p-6 sm:p-7">
      <h2 className="text-lg font-bold select-none" onClick={onTitleClick}>{title}</h2>
      {description && <p className="mt-1 mb-5 text-sm text-muted-foreground">{description}</p>}
      {children}
    </section>
  );
}

function ComingSoonRow({ icon, name, body }) {
  return (
    <li className="flex items-start gap-4 p-4">
      <span className="shrink-0" aria-hidden="true">{icon}</span>
      <div className="min-w-0 flex-1">
        <div className="flex flex-wrap items-center gap-2">
          <span className="text-sm font-bold">{name}</span>
          <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-semibold bg-primary-soft text-link">
            <Clock className="w-3 h-3" /> Coming soon
          </span>
        </div>
        <p className="mt-0.5 text-sm text-muted-foreground">{body}</p>
      </div>
    </li>
  );
}

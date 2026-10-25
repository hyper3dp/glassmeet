import React, { useEffect, useRef, useState } from 'react';
import { User, Globe, Clock, Upload, Loader2, Trash2, Plug, MapPin, Smartphone, Sparkles } from 'lucide-react';
import { GlassButton, GlassInput, GlassTextarea, GlassLabel, GlassSelect, Spinner, PageHeader, Avatar, SaveStatus } from '@/components/glass';
import { COMMON_TIMEZONES, detectTimezone } from '@/lib/Availability.js';
import { api } from '@/lib/localApi';
import { useAutosave } from '@/lib/useAutosave';
import OutlookIcon from '@/components/outlookicon.jsx';
import GoogleIcon from '@/components/googleicon.jsx';
import AddressManager from '@/components/AddressManager.jsx';

const SECTIONS = [
  { id: 'profile', label: 'Profile', icon: User },
  { id: 'timezone', label: 'Time zone', icon: Globe },
  { id: 'addresses', label: 'Addresses', icon: MapPin },
  { id: 'coming-soon', label: 'Coming soon', icon: Plug },
];

const MAX_PHOTO_MB = 5;

export default function Settings({ profile, updateProfile }) {
  const [form, setForm] = useState(null);
  const [activeSection, setActiveSection] = useState(SECTIONS[0].id);
  const [uploading, setUploading] = useState(false);
  const [photoError, setPhotoError] = useState('');
  const fileRef = useRef(null);

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

  // Booking pages read the zone from each event type (guests can't read profiles), so a new
  // time zone is copied onto the host's event types too.
  const savedTz = useRef(profile?.timezone || null);
  const save = async (value) => {
    await updateProfile({ ...value, username: value.username.trim() || null });
    if (value.timezone && value.timezone !== savedTz.current) {
      const events = await api.entities.EventType.filter({ created_by_id: profile.id });
      await Promise.all(events.filter((e) => e.host_timezone !== value.timezone).map((e) => api.entities.EventType.update(e.id, { host_timezone: value.timezone })));
      savedTz.current = value.timezone;
    }
  };
  const saveState = useAutosave(form, save, { enabled: !!form, delay: 900 });

  useEffect(() => {
    if (!form) return undefined;
    const observer = new IntersectionObserver((entries) => {
      const visible = entries.filter((e) => e.isIntersecting).sort((a, b) => a.boundingClientRect.top - b.boundingClientRect.top)[0];
      if (visible) setActiveSection(visible.target.id);
    }, { rootMargin: '-80px 0px -55% 0px' });
    SECTIONS.forEach((s) => { const el = document.getElementById(s.id); if (el) observer.observe(el); });
    return () => observer.disconnect();
  }, [!!form]);

  if (!form) return <div className="flex justify-center py-24"><Spinner /></div>;

  const set = (k, v) => setForm((f) => ({ ...f, [k]: v }));

  const onPickPhoto = async (e) => {
    const file = e.target.files?.[0];
    e.target.value = '';
    if (!file) return;
    setPhotoError('');
    if (!file.type.startsWith('image/')) { setPhotoError('Choose an image file (JPG, PNG or WebP).'); return; }
    if (file.size > MAX_PHOTO_MB * 1024 * 1024) { setPhotoError(`Choose an image under ${MAX_PHOTO_MB} MB.`); return; }
    setUploading(true);
    try {
      set('profile_photo', await api.storage.uploadAvatar(file));
    } catch (err) {
      setPhotoError(`Upload failed: ${err.message}`);
    }
    setUploading(false);
  };

  return (
    <div className="animate-fade-in">
      <PageHeader title="Account settings" description="Changes save automatically." actions={<SaveStatus state={saveState} />} />

      <div className="grid gap-8 lg:grid-cols-[200px_1fr]">
        <nav className="hidden lg:block" aria-label="Settings sections">
          <ul className="sticky top-24 space-y-0.5">
            {SECTIONS.map((s) => (
              <li key={s.id}>
                <a href={`#${s.id}`} aria-current={activeSection === s.id ? 'true' : undefined} className={`glass-nav-item flex items-center gap-3 rounded-lg px-3 h-10 text-sm font-semibold text-foreground ${activeSection === s.id ? 'active' : ''}`}>
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
                <GlassInput id="s-user" maxLength={40} value={form.username} onChange={(e) => set('username', e.target.value.toLowerCase().replace(/[^a-z0-9_]/g, ''))} />
              </div>
              <div>
                <GlassLabel htmlFor="s-email">Email</GlassLabel>
                <GlassInput id="s-email" value={profile.email || ''} disabled />
              </div>
              <div>
                <GlassLabel htmlFor="s-wa">WhatsApp number</GlassLabel>
                <GlassInput id="s-wa" type="tel" inputMode="tel" value={form.whatsapp_number} onChange={(e) => set('whatsapp_number', e.target.value)} placeholder="+1 555 000 0000" />
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
          <Section id="coming-soon" title="Coming soon" description="Features and integrations we're building next.">
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
        </div>
      </div>
    </div>
  );
}

function Section({ id, title, description, children }) {
  return (
    <section id={id} className="scroll-mt-24 rounded-xl border border-border bg-card shadow-card p-6 sm:p-7">
      <h2 className="text-lg font-bold">{title}</h2>
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

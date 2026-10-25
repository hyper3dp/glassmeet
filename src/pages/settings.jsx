import React, { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { User, Globe, Palette, Check, Copy, CalendarCheck, Unplug } from 'lucide-react';
import { GlassButton, GlassInput, GlassTextarea, GlassLabel, GlassSelect, Spinner, PageHeader, Avatar } from '@/components/glass';
import { Switch } from '@/components/ui/switch';
import { COMMON_TIMEZONES, detectTimezone } from '@/lib/Availability.js';
import { appPath } from '@/lib/authReturnTo';

const COLORS = ['#66ACA9', '#2B7A75', '#344248', '#E55D00', '#D6335C', '#8247F5', '#006BFF', '#64748B'];

const SECTIONS = [
  { id: 'profile', label: 'Profile', icon: User },
  { id: 'link', label: 'Time zone and link', icon: Globe },
  { id: 'branding', label: 'Branding', icon: Palette },
  { id: 'calendars', label: 'Calendars', icon: CalendarCheck },
];

export default function Settings({ profile, updateProfile }) {
  const [form, setForm] = useState(null);
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);
  const [copied, setCopied] = useState(false);
  const [activeSection, setActiveSection] = useState(SECTIONS[0].id);

  useEffect(() => {
    if (!form) return undefined;
    const observer = new IntersectionObserver((entries) => {
      const visible = entries.filter((e) => e.isIntersecting).sort((a, b) => a.boundingClientRect.top - b.boundingClientRect.top)[0];
      if (visible) setActiveSection(visible.target.id);
    }, { rootMargin: '-80px 0px -55% 0px' });
    SECTIONS.forEach((s) => { const el = document.getElementById(s.id); if (el) observer.observe(el); });
    return () => observer.disconnect();
  }, [!!form]);

  useEffect(() => {
    if (profile) {
      setForm({
        full_name: profile.full_name || '',
        profile_photo: profile.profile_photo || '',
        whatsapp_number: profile.whatsapp_number || '',
        timezone: profile.timezone || detectTimezone(),
        accent_color: profile.accent_color || '#66ACA9',
        bio: profile.bio || '',
        username: profile.username || (profile.email || '').split('@')[0],
      });
    }
  }, [profile]);

  if (!form) return <div className="flex justify-center py-24"><Spinner /></div>;

  const set = (k, v) => setForm((f) => ({ ...f, [k]: v }));

  const save = async () => {
    setSaving(true);
    try {
      await updateProfile(form);
      setSaved(true);
      setTimeout(() => setSaved(false), 2500);
    } catch (e) {
      alert('Could not save: ' + (e.message || ''));
    }
    setSaving(false);
  };

  const bookingLink = form.username ? `${window.location.origin}${appPath(`/u/${form.username}`)}` : '';

  return (
    <div className="animate-fade-in">
      <PageHeader title="Account settings" />

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
            <div className="flex items-center gap-5 mb-6">
              <Avatar src={form.profile_photo} name={form.full_name} size={72} />
              <div className="flex-1">
                <GlassLabel htmlFor="s-photo">Profile photo URL</GlassLabel>
                <GlassInput id="s-photo" value={form.profile_photo} onChange={(e)=>set('profile_photo', e.target.value)} placeholder="https://..." />
              </div>
            </div>
            <div className="grid sm:grid-cols-2 gap-5">
              <div>
                <GlassLabel htmlFor="s-name">Name</GlassLabel>
                <GlassInput id="s-name" value={form.full_name} onChange={(e)=>set('full_name', e.target.value)} />
              </div>
              <div>
                <GlassLabel htmlFor="s-user">Public username</GlassLabel>
                <GlassInput id="s-user" value={form.username} onChange={(e)=>set('username', e.target.value.toLowerCase().replace(/[^a-z0-9_]/g,''))} />
              </div>
              <div>
                <GlassLabel htmlFor="s-email">Email</GlassLabel>
                <GlassInput id="s-email" value={profile.email || ''} disabled />
              </div>
              <div>
                <GlassLabel htmlFor="s-wa">WhatsApp number</GlassLabel>
                <GlassInput id="s-wa" value={form.whatsapp_number} onChange={(e)=>set('whatsapp_number', e.target.value)} placeholder="+1 555 000 0000" />
              </div>
            </div>
            <div className="mt-5">
              <GlassLabel htmlFor="s-bio">Welcome message</GlassLabel>
              <GlassTextarea id="s-bio" rows={3} value={form.bio} onChange={(e)=>set('bio', e.target.value)} placeholder="A short intro shown on your booking page." />
            </div>
          </Section>

          {/* Time zone & link */}
          <Section id="link" title="Time zone and link" description="Used for all availability and bookings.">
            <div className="space-y-5">
              <div>
                <GlassLabel htmlFor="s-tz">Time zone</GlassLabel>
                <GlassSelect id="s-tz" value={form.timezone} onChange={(e)=>set('timezone', e.target.value)}>
                  {COMMON_TIMEZONES.map((tz)=><option key={tz} value={tz}>{tz}</option>)}
                </GlassSelect>
              </div>
              <div>
                <GlassLabel htmlFor="s-link">Public booking link</GlassLabel>
                <div className="flex gap-2">
                  <GlassInput id="s-link" value={bookingLink} readOnly />
                  <GlassButton type="button" variant="brand" onClick={()=>{ navigator.clipboard.writeText(bookingLink); setCopied(true); setTimeout(()=>setCopied(false),2000); }}>
                    {copied ? <><Check className="w-4 h-4" /> Copied</> : <><Copy className="w-4 h-4" /> Copy</>}
                  </GlassButton>
                </div>
              </div>
            </div>
          </Section>

          {/* Branding */}
          <Section id="branding" title="Branding" description="GlassMeet follows your device's light or dark setting. Your accent colour marks small details.">
            <GlassLabel>Accent colour</GlassLabel>
            <div className="flex gap-3 flex-wrap">
              {COLORS.map((c) => (
                <button
                  key={c}
                  type="button"
                  onClick={()=>set('accent_color', c)}
                  aria-label={`Accent ${c}`}
                  aria-pressed={form.accent_color===c}
                  className="w-9 h-9 rounded-full transition-all duration-200 flex items-center justify-center text-white"
                  style={{ background: c, boxShadow: form.accent_color===c ? '0 0 0 2px var(--card), 0 0 0 4px var(--foreground)' : 'none' }}
                >
                  {form.accent_color===c && <Check className="w-4 h-4" strokeWidth={3} />}
                </button>
              ))}
            </div>
          </Section>

          {/* Calendar Connections */}
          <Section id="calendars" title="Calendar connections" description="Connected calendars and sync settings.">
            <div className="divide-y divide-border rounded-lg border border-border">
              <CalendarSettingRow
                label="Microsoft Outlook"
                connected={!!profile?.outlook_connected}
                email={profile?.outlook_email}
                calendars={profile?.outlook_calendars || []}
                autoSync={profile?.outlook_auto_sync !== false}
                onToggleSync={() => updateProfile({ outlook_auto_sync: profile?.outlook_auto_sync === false })}
                onDisconnect={() => updateProfile({ outlook_connected: false, outlook_email: '', outlook_calendars: [], outlook_last_synced: null })}
              />
              <CalendarSettingRow
                label="Google Calendar"
                connected={!!profile?.google_calendar_connected}
                calendars={profile?.google_calendars || []}
                autoSync={profile?.google_auto_sync !== false}
                onToggleSync={() => updateProfile({ google_auto_sync: profile?.google_auto_sync === false })}
                onDisconnect={() => updateProfile({ google_calendar_connected: false, google_calendars: [], google_last_synced: null })}
              />
            </div>
            <p className="text-sm text-muted-foreground mt-3">Apple Calendar works on Apple devices through .ics downloads. Manage connections on the <Link to="/calendar-connections" className="font-semibold text-link hover:underline">Calendars page</Link>.</p>
          </Section>

          <div className="flex justify-end">
            <GlassButton variant="primary" type="button" onClick={save} disabled={saving}>
              {saving ? 'Saving…' : saved ? <><Check className="w-4 h-4" /> Saved</> : 'Save changes'}
            </GlassButton>
          </div>
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

function CalendarSettingRow({ label, connected, email, calendars, autoSync, onToggleSync, onDisconnect }) {
  return (
    <div className="p-4">
      <div className="flex items-center justify-between gap-3">
        <div className="flex items-center gap-2">
          <span className="text-sm font-bold">{label}</span>
          {connected ? (
            <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-semibold bg-success/10 text-success">
              <Check className="w-3 h-3" /> Connected
            </span>
          ) : (
            <span className="inline-flex items-center px-2 py-0.5 rounded-full text-xs font-semibold bg-primary-soft text-link">Coming soon</span>
          )}
        </div>
        {connected && (
          <label className="flex items-center gap-2 text-sm text-muted-foreground">
            Auto-sync <Switch checked={autoSync} onCheckedChange={onToggleSync} aria-label={`Auto-sync ${label}`} />
          </label>
        )}
      </div>
      {connected ? (
        <div className="mt-2 space-y-1 text-sm text-muted-foreground">
          {email && <div>Account: {email}</div>}
          <div>Calendars: {calendars.length ? calendars.join(', ') : 'All calendars'}</div>
          <button type="button" onClick={onDisconnect} className="flex items-center gap-1.5 font-semibold text-destructive hover:underline mt-2">
            <Unplug className="w-3.5 h-3.5" /> Disconnect
          </button>
        </div>
      ) : (
        <p className="mt-1 text-sm text-muted-foreground">Account connections are coming soon.</p>
      )}
    </div>
  );
}

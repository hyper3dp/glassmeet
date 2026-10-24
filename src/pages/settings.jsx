import React, { useEffect, useState } from 'react';
import { api } from '@/lib/localApi';
import {
  User, Mail, Phone, Globe, Palette, Save, Check, Camera, Link as LinkIcon, Copy, CalendarCheck, Unplug,
} from 'lucide-react';
import { GlassCard, GlassButton, GlassInput, GlassTextarea, GlassLabel, GlassSelect, Spinner } from '@/components/glass';
import { Switch } from '@/components/ui/switch';
import { COMMON_TIMEZONES, detectTimezone } from '@/lib/Availability.js';
import { appPath } from '@/lib/authReturnTo';

const COLORS = ['#0A84FF', '#30D158', '#FF9F0A', '#FF375F', '#BF5AF2', '#64D2FF', '#5E5CE6', '#8E8E93'];

export default function Settings({ profile, updateProfile }) {
  const [form, setForm] = useState(null);
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);
  const [copied, setCopied] = useState(false);

  useEffect(() => {
    if (profile) {
      setForm({
        full_name: profile.full_name || '',
        profile_photo: profile.profile_photo || '',
        whatsapp_number: profile.whatsapp_number || '',
        timezone: profile.timezone || detectTimezone(),
        accent_color: profile.accent_color || '#0A84FF',
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
    <div className="space-y-6 animate-fade-in max-w-3xl">
      <div>
        <h1 className="text-2xl sm:text-3xl font-semibold tracking-tight">Settings</h1>
        <p className="text-muted-foreground text-sm mt-1">Manage your profile, appearance, and preferences.</p>
      </div>

      {/* Profile */}
      <GlassCard hover={false}>
        <div className="flex items-center gap-3 mb-5">
          <div className="w-11 h-11 rounded-2xl glass flex items-center justify-center"><User className="w-5 h-5 accent-text" /></div>
          <div><h2 className="font-semibold">Profile</h2><p className="text-xs text-muted-foreground">How you appear on booking pages.</p></div>
        </div>
        <div className="flex items-center gap-4 mb-5">
          <div className="w-16 h-16 rounded-2xl glass overflow-hidden flex items-center justify-center">
            {form.profile_photo ? <img src={form.profile_photo} alt="" className="w-full h-full object-cover" /> : <User className="w-7 h-7 text-muted-foreground" />}
          </div>
          <div className="flex-1">
            <GlassLabel>Profile photo URL</GlassLabel>
            <GlassInput value={form.profile_photo} onChange={(e)=>set('profile_photo', e.target.value)} placeholder="https://..." />
          </div>
        </div>
        <div className="grid sm:grid-cols-2 gap-4">
          <div>
            <GlassLabel>Full name</GlassLabel>
            <GlassInput value={form.full_name} onChange={(e)=>set('full_name', e.target.value)} />
          </div>
          <div>
            <GlassLabel>Public username</GlassLabel>
            <GlassInput value={form.username} onChange={(e)=>set('username', e.target.value.toLowerCase().replace(/[^a-z0-9_]/g,''))} />
          </div>
          <div>
            <GlassLabel>Email</GlassLabel>
            <GlassInput value={profile.email || ''} disabled />
          </div>
          <div>
            <GlassLabel>WhatsApp number</GlassLabel>
            <GlassInput value={form.whatsapp_number} onChange={(e)=>set('whatsapp_number', e.target.value)} placeholder="+1 555 000 0000" />
          </div>
        </div>
        <div className="mt-4">
          <GlassLabel>Bio</GlassLabel>
          <GlassTextarea rows={2} value={form.bio} onChange={(e)=>set('bio', e.target.value)} placeholder="A short intro shown on your booking page." />
        </div>
      </GlassCard>

      {/* Timezone & booking link */}
      <GlassCard hover={false}>
        <div className="flex items-center gap-3 mb-5">
          <div className="w-11 h-11 rounded-2xl glass flex items-center justify-center"><Globe className="w-5 h-5 accent-text" /></div>
          <div><h2 className="font-semibold">Time zone & link</h2><p className="text-xs text-muted-foreground">Used for all availability and bookings.</p></div>
        </div>
        <div className="space-y-4">
          <div>
            <GlassLabel>Time zone</GlassLabel>
            <GlassSelect value={form.timezone} onChange={(e)=>set('timezone', e.target.value)}>
              {COMMON_TIMEZONES.map((tz)=><option key={tz} value={tz}>{tz}</option>)}
            </GlassSelect>
          </div>
          <div>
            <GlassLabel>Public booking link</GlassLabel>
            <div className="flex gap-2">
              <GlassInput value={bookingLink} readOnly />
              <GlassButton onClick={()=>{ navigator.clipboard.writeText(bookingLink); setCopied(true); setTimeout(()=>setCopied(false),2000); }}>{copied ? <Check className="w-4 h-4 accent-text" /> : <Copy className="w-4 h-4" />}</GlassButton>
            </div>
          </div>
        </div>
      </GlassCard>

      {/* Appearance */}
      <GlassCard hover={false}>
        <div className="flex items-center gap-3 mb-5">
          <div className="w-11 h-11 rounded-2xl glass flex items-center justify-center"><Palette className="w-5 h-5 accent-text" /></div>
          <div><h2 className="font-semibold">Appearance</h2><p className="text-xs text-muted-foreground">Theme and accent color.</p></div>
        </div>
        <div className="space-y-4">
          <div>
            <GlassLabel>Accent color</GlassLabel>
            <div className="flex gap-2 flex-wrap">
              {COLORS.map((c) => (
                <button key={c} onClick={()=>set('accent_color', c)} className="w-9 h-9 rounded-full transition-all duration-200" style={{ background: c, outline: form.accent_color===c ? '2px solid var(--foreground)' : '1px solid var(--border)', outlineOffset: '3px' }} />
              ))}
            </div>
          </div>
        </div>
      </GlassCard>

      {/* Calendar Connections */}
      <GlassCard hover={false}>
        <div className="flex items-center gap-3 mb-5">
          <div className="w-11 h-11 rounded-2xl glass flex items-center justify-center"><CalendarCheck className="w-5 h-5 accent-text" /></div>
          <div><h2 className="font-semibold">Calendar Connections</h2><p className="text-xs text-muted-foreground">Manage connected calendars and sync settings.</p></div>
        </div>
        <div className="space-y-4">
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
        <p className="text-xs text-muted-foreground mt-3">Apple Calendar is always available on Apple devices via .ics download. Manage full connections on the Calendars page.</p>
      </GlassCard>

      <div className="flex gap-3">
        <GlassButton variant="primary" onClick={save} disabled={saving}>
          {saving ? 'Saving…' : saved ? <><Check className="w-4 h-4" /> Saved</> : <><Save className="w-4 h-4" /> Save changes</>}
        </GlassButton>
      </div>
    </div>
  );
}

function CalendarSettingRow({ label, connected, email, calendars, autoSync, onToggleSync, onDisconnect }) {
  return (
    <div className="glass rounded-xl p-4">
      <div className="flex items-center justify-between mb-2">
        <div className="flex items-center gap-2">
          <span className="text-sm font-medium">{label}</span>
          {connected ? (
            <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] glass text-emerald-600 dark:text-emerald-400">
              <Check className="w-3 h-3" /> Connected
            </span>
          ) : (
            <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] glass text-muted-foreground">Not connected</span>
          )}
        </div>
        {connected && (
          <Switch checked={autoSync} onCheckedChange={onToggleSync} aria-label={`Auto-sync ${label}`} />
        )}
      </div>
      {connected ? (
        <div className="space-y-1 text-xs text-muted-foreground">
          {email && <div>Account: {email}</div>}
          <div>Calendars: {calendars.length ? calendars.join(', ') : 'All calendars'}</div>
          <div>Auto-sync: {autoSync ? 'ON' : 'OFF'}</div>
          <button onClick={onDisconnect} className="flex items-center gap-1.5 text-red-500 hover:text-red-600 mt-2">
            <Unplug className="w-3 h-3" /> Disconnect
          </button>
        </div>
      ) : (
        <p className="text-xs text-muted-foreground">Visit the Calendar Connections page to connect.</p>
      )}
    </div>
  );
}
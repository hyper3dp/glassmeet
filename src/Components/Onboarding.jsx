import React, { useEffect, useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Upload, Loader2, Globe } from 'lucide-react';
import { api } from '@/lib/localApi';
import { GlassButton, GlassInput, GlassLabel, TimeSelect, Avatar, Spinner } from '@/components/glass';
import Logo from '@/components/logo.jsx';
import { detectTimezone } from '@/lib/Availability.js';
import { normalizePhone } from '@/lib/whatsapp';
import { cn } from '@/lib/utils';
import { LIMITS, onlyName, onlyPhone } from '@/lib/inputRules';

const MAX_PHOTO_MB = 5;
const PHOTO_TYPES = ['image/jpeg', 'image/png', 'image/webp', 'image/gif'];
const WEEKDAYS = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
const STEPS = ['profile', 'whatsapp', 'hours'];
const toMin = (t) => { const [h, m] = (t || '0:0').split(':').map(Number); return h * 60 + m; };

// First-run setup for a new host (profiles.onboarded = false): name and photo, WhatsApp number
// (required) and weekly hours, one per screen. Finishing marks the profile onboarded and opens
// the dashboard with the tour. The time zone is detected and saved without asking.
export default function Onboarding({ profile, updateProfile, whatsapp, setWhatsapp }) {
  const navigate = useNavigate();
  const [step, setStep] = useState(0);
  const [name, setName] = useState(profile.full_name || '');
  const [photo, setPhoto] = useState(profile.profile_photo || '');
  const [phone, setPhone] = useState(profile.whatsapp_number || whatsapp?.phone_number || '');
  const [days, setDays] = useState(null); // null until the hours have loaded
  const [start, setStart] = useState('09:00');
  const [end, setEnd] = useState('17:00');
  const loadedHours = useRef(null);
  const [uploading, setUploading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  const fileRef = useRef(null);
  const headingRef = useRef(null);
  // the zone the hours are saved in (one already on the profile wins), as the hours step names it
  const timezone = useRef(profile.timezone || detectTimezone()).current;

  // the hours new accounts already get (Mon–Fri 9–5), shown as days plus one range
  useEffect(() => {
    api.entities.AvailabilityRule.filter({ created_by_id: profile.id }).then((rules) => {
      const first = [...rules].sort((a, b) => toMin(a.start_time) - toMin(b.start_time))[0];
      const picked = [...new Set(rules.map((r) => r.day_of_week))].sort();
      const range = first ? { start: first.start_time.slice(0, 5), end: first.end_time.slice(0, 5) } : { start: '09:00', end: '17:00' };
      loadedHours.current = { rules, days: picked, ...range };
      setDays(picked.length ? picked : [1, 2, 3, 4, 5]);
      setStart(range.start);
      setEnd(range.end);
    }).catch(() => setDays([1, 2, 3, 4, 5]));
  }, [profile.id]);

  // each screen's heading takes focus, so screen readers announce the new step
  useEffect(() => { headingRef.current?.focus(); setError(''); }, [step]);

  const phoneOk = /^\+\d{7,15}$/.test(normalizePhone(phone.trim().replace(/^00/, '+')));

  const onPickPhoto = async (e) => {
    const file = e.target.files?.[0];
    e.target.value = '';
    if (!file) return;
    setError('');
    // the avatars bucket takes only these (HEIC, SVG, AVIF... would fail with a raw server error)
    if (!PHOTO_TYPES.includes(file.type)) { setError('Choose an image file (JPG, PNG or WebP).'); return; }
    if (file.size > MAX_PHOTO_MB * 1024 * 1024) { setError(`Choose an image under ${MAX_PHOTO_MB} MB.`); return; }
    setUploading(true);
    try {
      setPhoto(await api.storage.uploadAvatar(file));
    } catch (err) {
      setError(`Upload failed: ${err.message}`);
    }
    setUploading(false);
  };

  // Runs the step's save, then moves on; a failure stays on the step with its message
  const run = async (work, next) => {
    setSaving(true);
    setError('');
    try {
      await work();
      next();
    } catch (e) {
      setError(e?.message || 'Something went wrong. Try again.');
    }
    setSaving(false);
  };

  const saveProfile = () => run(async () => {
    const full_name = name.trim();
    if (full_name !== (profile.full_name || '') || photo !== (profile.profile_photo || '')) {
      await updateProfile({ full_name: full_name || profile.full_name || '', profile_photo: photo || null });
    }
  }, () => setStep(1));

  const saveWhatsApp = () => {
    if (!phoneOk) { setError('Enter your WhatsApp number with the country code, e.g. +971 50 123 4567.'); return; }
    run(async () => {
      const number = normalizePhone(phone.trim().replace(/^00/, '+'));
      await updateProfile({ whatsapp_number: number });
      // the WhatsApp page keeps its own copy of the number; keep the two the same. The profile
      // number is the one that counts, so a failure here doesn't hold the host up.
      try {
        if (whatsapp?.id) setWhatsapp(await api.entities.WhatsAppSetting.update(whatsapp.id, { phone_number: number }) || whatsapp);
        else setWhatsapp(await api.entities.WhatsAppSetting.create({ phone_number: number, enabled: true, provider: 'deep_link' }));
      } catch { /* the WhatsApp page falls back to the profile number */ }
    }, () => setStep(2));
  };

  // skipping hours keeps whatever is saved (the default Mon–Fri 9–5)
  const finish = (keepHours) => {
    if (!keepHours && toMin(end) <= toMin(start)) { setError('End time must be after the start time.'); return; }
    run(async () => {
      const was = loadedHours.current;
      const changed = !was || was.start !== start || was.end !== end || was.days.join() !== [...days].sort().join();
      if (!keepHours && changed) {
        await Promise.all((was?.rules || []).map((r) => api.entities.AvailabilityRule.delete(r.id)));
        if (days.length) await api.entities.AvailabilityRule.bulkCreate(days.map((d) => ({ day_of_week: d, start_time: start, end_time: end })));
      }
      await updateProfile({ timezone, onboarded: true });
    }, () => navigate('/dashboard?tour=1', { replace: true }));
  };

  const toggleDay = (d) => setDays((cur) => (cur.includes(d) ? cur.filter((x) => x !== d) : [...cur, d].sort()));

  const heading = (text, sub) => (
    <div className="mb-8">
      <h1 ref={headingRef} tabIndex={-1} className="text-[28px] font-bold tracking-tight leading-tight outline-none">{text}</h1>
      <p className="mt-2 text-[15px] text-muted-foreground">{sub}</p>
    </div>
  );

  const skip = (onClick) => (
    <button type="button" onClick={onClick} disabled={saving} className="h-10 px-2 text-sm font-semibold text-muted-foreground hover:text-foreground disabled:opacity-60">Skip for now</button>
  );

  return (
    <div className="min-h-screen flex flex-col items-center bg-background px-4 py-10 sm:py-16">
      <Logo />
      <div className="w-full max-w-[520px] mt-10">
        {/* progress */}
        <div className="mb-3 flex items-center justify-between text-sm font-semibold text-muted-foreground">
          <span>Step {step + 1} of {STEPS.length}</span>
        </div>
        <div className="mb-6 grid grid-cols-3 gap-1.5" aria-hidden="true">
          {STEPS.map((s, i) => <div key={s} className={cn('h-1.5 rounded-full transition-all duration-200', i <= step ? 'bg-primary' : 'bg-border')} />)}
        </div>

        <div className="bg-card rounded-xl border border-border shadow-card p-6 sm:p-8 animate-fade-in" key={step}>
          {step === 0 && (
            <form onSubmit={(e) => { e.preventDefault(); saveProfile(); }}>
              {heading('Welcome to GlassMeet', 'Guests see your name and photo when they book you.')}
              <div className="flex flex-wrap items-center gap-4 mb-6">
                <Avatar src={photo} name={name} size={64} />
                <input ref={fileRef} type="file" accept="image/png,image/jpeg,image/webp,image/gif" className="sr-only" onChange={onPickPhoto} aria-label="Upload profile photo" />
                <GlassButton type="button" onClick={() => fileRef.current?.click()} disabled={uploading}>
                  {uploading ? <Loader2 className="w-4 h-4 animate-spin" /> : <Upload className="w-4 h-4" />} {photo ? 'Change photo' : 'Add a photo'}
                </GlassButton>
              </div>
              <GlassLabel htmlFor="ob-name">Your name</GlassLabel>
              <GlassInput id="ob-name" autoComplete="name" maxLength={LIMITS.name} value={name} onChange={(e) => setName(onlyName(e.target.value))} placeholder="Sara Ahmed" />
              {error && <p role="alert" className="mt-4 text-sm text-destructive">{error}</p>}
              <div className="mt-8 flex items-center justify-end gap-2">
                {skip(() => setStep(1))}
                <GlassButton type="submit" variant="primary" disabled={saving || uploading}>{saving ? 'Saving…' : 'Next'}</GlassButton>
              </div>
            </form>
          )}

          {step === 1 && (
            <form onSubmit={(e) => { e.preventDefault(); saveWhatsApp(); }} noValidate>
              {heading('Your WhatsApp number', 'Guests and GlassMeet confirm meetings with you on WhatsApp.')}
              <GlassLabel htmlFor="ob-phone">WhatsApp number</GlassLabel>
              <GlassInput id="ob-phone" type="tel" inputMode="tel" autoComplete="tel" maxLength={LIMITS.phone} value={phone}
                onChange={(e) => setPhone(onlyPhone(e.target.value))} placeholder="+971 50 123 4567"
                aria-invalid={!!error} aria-describedby="ob-phone-hint" />
              <p id="ob-phone-hint" className="mt-1.5 text-xs text-muted-foreground">Start with your country code, like +971 or +44.</p>
              {error && <p role="alert" className="mt-4 text-sm text-destructive">{error}</p>}
              <div className="mt-8 flex items-center justify-between gap-2">
                <GlassButton type="button" variant="ghost" onClick={() => setStep(0)} disabled={saving}>Back</GlassButton>
                <GlassButton type="submit" variant="primary" disabled={saving}>{saving ? 'Saving…' : 'Next'}</GlassButton>
              </div>
            </form>
          )}

          {step === 2 && (
            <form onSubmit={(e) => { e.preventDefault(); finish(false); }}>
              {heading('When can guests book you?', 'Your weekly hours. You can add breaks and days off later in Availability.')}
              {days === null ? (
                <div className="flex justify-center py-8"><Spinner /></div>
              ) : (
                <>
                  <fieldset>
                    <legend className="mb-2 text-sm font-semibold">Days</legend>
                    <div className="flex flex-wrap gap-2">
                      {WEEKDAYS.map((label, d) => (
                        <button key={label} type="button" aria-pressed={days.includes(d)} onClick={() => toggleDay(d)}
                          className={cn('h-10 min-w-12 px-3 rounded-full border text-sm font-semibold transition-all duration-200',
                            days.includes(d) ? 'border-primary bg-primary-soft text-link' : 'border-input text-foreground hover:border-border-hover')}>
                          {label}
                        </button>
                      ))}
                    </div>
                  </fieldset>
                  <div className="mt-5 grid grid-cols-2 gap-3">
                    <div>
                      <GlassLabel htmlFor="ob-start">From</GlassLabel>
                      <TimeSelect id="ob-start" value={start} onChange={setStart} />
                    </div>
                    <div>
                      <GlassLabel htmlFor="ob-end">To</GlassLabel>
                      <TimeSelect id="ob-end" value={end} onChange={setEnd} midnight />
                    </div>
                  </div>
                  <p className="mt-4 flex items-center gap-2 text-sm text-muted-foreground"><Globe className="w-4 h-4" /> Times are in your time zone, {timezone.replace(/_/g, ' ')}.</p>
                  {!days.length && <p className="mt-2 text-sm text-warning">With no days picked, guests can’t book you until you add hours.</p>}
                </>
              )}
              {error && <p role="alert" className="mt-4 text-sm text-destructive">{error}</p>}
              <div className="mt-8 flex items-center justify-between gap-2">
                <GlassButton type="button" variant="ghost" onClick={() => setStep(1)} disabled={saving}>Back</GlassButton>
                <div className="flex items-center gap-2">
                  {skip(() => finish(true))}
                  <GlassButton type="submit" variant="primary" disabled={saving || days === null}>{saving ? 'Saving…' : 'Finish'}</GlassButton>
                </div>
              </div>
            </form>
          )}
        </div>
      </div>
    </div>
  );
}

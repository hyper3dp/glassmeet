  api.auth.loginWithGoogle('/calendar-connections', 'calendar').catch((error) => setGoogleError(error.message));
import React, { useState, useEffect } from 'react';
import {
  Calendar, CalendarCheck, RefreshCw, Plug, Unplug, CheckCircle2,
  Apple, Shield, AlertCircle, Loader2, Settings2, Zap, Link2, ZapOff,
  Rss, Copy, RotateCcw, Trash2, Bell, Plus, Globe,
} from 'lucide-react';
import { GlassCard, GlassButton, GlassInput } from '@/components/glass';
import { api } from '@/lib/localApi';
import { useApp } from '@/lib/useprofile.js';
import { downloadIcs } from '@/lib/calendar';
import { downloadICSFeed, generateSubscriptionToken } from '@/lib/calendarFeed';
import OutlookIcon from '@/components/outlookicon.jsx';
import { getCalendarPriority } from '@/lib/devicedetect.js';
import { appPath } from '@/lib/authReturnTo';

const SAMPLE_BOOKING = {
  id: 'sample',
  start_time: new Date(Date.now() + 86400000).toISOString(),
  end_time: new Date(Date.now() + 86400000 + 30 * 60000).toISOString(),
  timezone: Intl.DateTimeFormat().resolvedOptions().timeZone || 'UTC',
  guest_name: 'Sample Guest',
  guest_email: 'guest@example.com',
  guest_phone: '+1234567890',
  guest_notes: 'This is a test event from GlassMeet.',
  meeting_url: 'https://meet.glassmeet.app/sample',
};
const SAMPLE_EVENT = { name: 'GlassMeet Test', duration: 30, location: 'Online', description: 'Test event', meeting_url: 'https://meet.glassmeet.app/sample' };

export default function CalendarConnections() {
  const { profile, updateProfile } = useApp();
  const [showGoogleSetup, setShowGoogleSetup] = useState(false);
  const [googleAccount, setGoogleAccount] = useState({ connected: false });
  const [googleCalendarsList, setGoogleCalendarsList] = useState([]);
  const [googleError, setGoogleError] = useState(() => new URLSearchParams(window.location.search).get('google_error') === 'not_configured'
    ? 'Google Calendar is not configured yet. Add the Google OAuth values to .env.'
    : '');
  const [testing, setTesting] = useState(false);
  const [testResult, setTestResult] = useState(null);
  const [syncing, setSyncing] = useState(false);
  const [subscriptions, setSubscriptions] = useState([]);
  const [subLoading, setSubLoading] = useState(false);
  const [copiedSub, setCopiedSub] = useState(null);

  const googleConnected = Boolean(googleAccount.connected);
  const autoSync = googleAccount.auto_sync ?? true;
  const selectedCalendars = googleAccount.calendar_name ? [googleAccount.calendar_name] : [];
  const lastSynced = googleAccount.last_synced;

  // Microsoft Outlook connection state (Microsoft 365 + Outlook.com)
  // Uses Microsoft Graph API via platform OAuth — supports both work/school and personal accounts.
  const outlookConnected = !!profile?.outlook_connected;
  const outlookEmail = profile?.outlook_email || '';
  const outlookAccountType = profile?.outlook_account_type || '';
  const outlookCalendars = profile?.outlook_calendars || [];
  const outlookAutoSync = profile?.outlook_auto_sync !== false;
  const outlookLastSynced = profile?.outlook_last_synced;
  const [showOutlookSetup, setShowOutlookSetup] = useState(false);

  // WebCal subscription input
  const [webcalUrl, setWebcalUrl] = useState('');
  const [webcalSubscribing, setWebcalSubscribing] = useState(false);

  // Device-aware calendar ordering
  const calendarPriority = getCalendarPriority();

  const refreshGoogle = async () => {
    try {
      const status = await api.google.status();
      setGoogleAccount(status);
      setGoogleError('');
      setGoogleCalendarsList(status.connected ? await api.google.calendars() : []);
    } catch (error) {
      setGoogleError(error.message);
    }
  };

  useEffect(() => { refreshGoogle(); }, []);

  const handleConnectGoogle = () => {
    api.auth.loginWithGoogle('/calendar-connections', 'calendar').catch((error) => setGoogleError(error.message));
  };

  const handleDisconnectGoogle = async () => {
    await api.google.disconnect();
    setGoogleAccount({ connected: false });
    setGoogleCalendarsList([]);
  };

  const toggleAutoSync = async () => {
    const result = await api.google.saveSettings({ calendarId: googleAccount.calendar_id, autoSync: !autoSync });
    setGoogleAccount((current) => ({ ...current, auto_sync: result.autoSync }));
  };

  const syncNow = async () => {
    setSyncing(true);
    try {
      await api.google.sync();
      await refreshGoogle();
    } catch (error) {
      setGoogleError(error.message);
    } finally {
      setSyncing(false);
    }
  };

  // Microsoft Outlook handlers
  const handleConnectOutlook = () => setShowOutlookSetup(true);

  const handleDisconnectOutlook = async () => {
    await updateProfile({ outlook_connected: false, outlook_email: '', outlook_calendars: [], outlook_last_synced: null, outlook_account_type: '' });
  };

  const toggleOutlookAutoSync = async () => {
    await updateProfile({ outlook_auto_sync: !outlookAutoSync });
  };

  const syncOutlookNow = async () => {
    setSyncing(true);
    setTimeout(async () => {
      await updateProfile({ outlook_last_synced: new Date().toISOString() });
      setSyncing(false);
    }, 1200);
  };

  // WebCal subscription
  const subscribeWebcal = async () => {
    if (!webcalUrl || !webcalUrl.startsWith('http')) return;
    setWebcalSubscribing(true);
    try {
      const token = generateSubscriptionToken();
      await api.entities.CalendarSubscription.create({
        token,
        name: 'WebCal Subscription',
        scope: 'all_events',
        active: true,
        webcal_url: webcalUrl,
        subscription_type: 'webcal',
        last_synced: new Date().toISOString(),
      });
      setWebcalUrl('');
      await loadSubscriptions();
    } catch {}
    setWebcalSubscribing(false);
  };

  const testGoogle = async () => {
    setTesting('google');
    try {
      await api.google.calendars();
      setTestResult({ type: 'google', ok: true });
      setGoogleError('');
    } catch (error) {
      setGoogleError(error.message);
      setTestResult({ type: 'google', ok: false });
    } finally {
      setTesting(null);
    }
  };

  const testAppleCalendar = () => {
    setTesting('apple');
    setTimeout(() => {
      downloadIcs(SAMPLE_BOOKING, SAMPLE_EVENT, { full_name: profile?.full_name || 'Host' });
      setTestResult({ type: 'apple', ok: true });
      setTesting(null);
    }, 600);
  };

  // Calendar subscriptions
  const loadSubscriptions = async () => {
    setSubLoading(true);
    try {
      const subs = await api.entities.CalendarSubscription.filter({}, '-created_date');
      setSubscriptions(subs);
    } catch {}
    setSubLoading(false);
  };

  useEffect(() => { loadSubscriptions(); }, []);

  const createSubscription = async () => {
    const token = generateSubscriptionToken();
    await api.entities.CalendarSubscription.create({
      token,
      name: 'My Calendar',
      scope: 'all_events',
      active: true,
    });
    await loadSubscriptions();
  };

  const regenerateToken = async (id) => {
    const newToken = generateSubscriptionToken();
    await api.entities.CalendarSubscription.update(id, { token: newToken, last_synced: new Date().toISOString() });
    await loadSubscriptions();
  };

  const revokeSubscription = async (id) => {
    await api.entities.CalendarSubscription.update(id, { active: false });
    await loadSubscriptions();
  };

  const copySubscriptionUrl = (token) => {
    const url = `${window.location.origin}${appPath(`/calendar-feed/${token}`)}`;
    navigator.clipboard.writeText(url);
    setCopiedSub(token);
    setTimeout(() => setCopiedSub(null), 2000);
  };

  const downloadFeed = async (sub) => {
    const bookings = await api.entities.Booking.filter({ host_id: profile.id, status: 'confirmed' }, '-start_time', 200);
    downloadICSFeed(bookings);
  };

  return (
    <div className="space-y-6 animate-fade-in">
      <header>
        <h1 className="text-2xl font-semibold">Calendar Connections</h1>
        <p className="text-sm text-muted-foreground mt-1">Connect your calendars to check availability and sync meetings automatically.</p>
      </header>

      {/* Summary stats */}
      <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
        <SummaryStat
          icon={Link2}
          label="Connected"
          value={`${(googleConnected ? 1 : 0) + (outlookConnected ? 1 : 0)} / 3`}
          hint={[googleConnected && 'Google', outlookConnected && 'Outlook', 'Apple'].filter(Boolean).join(' + ') || 'Apple only'}
        />
        <SummaryStat
          icon={RefreshCw}
          label="Last sync"
          value={lastSynced ? new Date(lastSynced).toLocaleDateString() : '—'}
          hint={lastSynced ? new Date(lastSynced).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }) : 'Not synced yet'}
        />
        <SummaryStat
          icon={autoSync ? Zap : ZapOff}
          label="Auto-sync"
          value={autoSync ? 'On' : 'Off'}
          hint={autoSync ? 'Real-time' : 'Manual'}
          className="col-span-2 sm:col-span-1"
        />
      </div>

      {/* Google Calendar */}
      <GlassCard hover={false} className="p-0 overflow-hidden">
        <div className="p-5 flex items-start gap-4">
          <div className="w-11 h-11 rounded-xl bg-white shadow-sm flex items-center justify-center shrink-0">
            <GoogleG />
          </div>
          <div className="flex-1 min-w-0">
            <div className="flex items-center gap-2 flex-wrap">
              <h2 className="font-semibold">Google Calendar</h2>
              <StatusBadge connected={googleConnected} />
            </div>
            <p className="text-sm text-muted-foreground mt-1">
              {googleConnected
                ? 'Connected. Availability is checked against your Google Calendar before booking slots are shown.'
                : 'Connect to automatically check availability, prevent conflicts, and create events when meetings are booked.'}
            </p>

            {googleConnected && (
              <div className="mt-4 space-y-3">
                <div className="flex flex-wrap gap-2">
                  {selectedCalendars.length ? selectedCalendars.map((c) => (
                    <span key={c} className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs glass">
                      <Calendar className="w-3 h-3" /> {c}
                    </span>
                  )) : <span className="text-xs text-muted-foreground">Checking all calendars</span>}
                </div>
                {lastSynced && (
                  <div className="text-xs text-muted-foreground flex items-center gap-1.5">
                    <RefreshCw className="w-3 h-3" /> Last synced {new Date(lastSynced).toLocaleString()}
                  </div>
                )}
                {testResult?.type === 'google' && testResult.ok && (
                  <p className="text-xs text-emerald-600 dark:text-emerald-400 flex items-center gap-1.5">
                    <CheckCircle2 className="w-3 h-3" /> Connection verified — token is valid.
                  </p>
                )}
                {googleError && <p className="text-xs text-destructive">{googleError}</p>}
                <label className="flex items-center gap-2.5 cursor-pointer pt-1">
                  <button
                    type="button"
                    onClick={toggleAutoSync}
                    className={`relative w-9 h-5 rounded-full transition-colors ${autoSync ? 'accent-bg' : 'bg-muted'}`}
                  >
                    <span className={`absolute top-0.5 w-4 h-4 rounded-full bg-white shadow transition-transform ${autoSync ? 'translate-x-4' : 'translate-x-0.5'}`} />
                  </button>
                  <span className="text-sm">Auto-sync new bookings to Google</span>
                </label>
              </div>
            )}
          </div>
        </div>

        <div className="px-5 pb-5 flex flex-wrap gap-2">
          {googleConnected ? (
            <>
              <GlassButton size="sm" onClick={() => setShowGoogleSetup(true)}>
                <Settings2 className="w-4 h-4" /> Calendars
              </GlassButton>
              <GlassButton size="sm" onClick={syncNow} disabled={syncing}>
                {syncing ? <Loader2 className="w-4 h-4 animate-spin" /> : <RefreshCw className="w-4 h-4" />} Sync now
              </GlassButton>
              <GlassButton size="sm" variant="ghost" onClick={testGoogle} disabled={testing === 'google'}>
                {testing === 'google' ? <Loader2 className="w-4 h-4 animate-spin" /> : <CheckCircle2 className="w-4 h-4" />} Test
              </GlassButton>
              <GlassButton size="sm" variant="ghost" onClick={handleDisconnectGoogle}>
                <Unplug className="w-4 h-4" /> Disconnect
              </GlassButton>
            </>
          ) : (
            <GlassButton size="sm" variant="primary" onClick={handleConnectGoogle}>
              <Plug className="w-4 h-4" /> Connect
            </GlassButton>
          )}
        </div>
      </GlassCard>

      {/* Apple Calendar */}
      <GlassCard hover={false} className="p-0 overflow-hidden">
        <div className="p-5 flex items-start gap-4">
          <div className="w-11 h-11 rounded-xl bg-black flex items-center justify-center shrink-0">
            <Apple className="w-6 h-6 text-white" />
          </div>
          <div className="flex-1 min-w-0">
            <div className="flex items-center gap-2 flex-wrap">
              <h2 className="font-semibold">Apple Calendar</h2>
              <span className="inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full text-xs glass text-emerald-600 dark:text-emerald-400">
                <CheckCircle2 className="w-3 h-3" /> Always available
              </span>
            </div>
            <p className="text-sm text-muted-foreground mt-1">
              Add meetings to Apple Calendar on iPhone, iPad, and Mac using a standard <code className="text-xs">.ics</code> calendar file. No account connection required.
            </p>
            {testResult?.type === 'apple' && testResult.ok && (
              <p className="text-xs text-emerald-600 dark:text-emerald-400 mt-2 flex items-center gap-1.5">
                <CheckCircle2 className="w-3 h-3" /> Test event downloaded — open it to add to Apple Calendar.
              </p>
            )}
          </div>
        </div>
        <div className="px-5 pb-5 flex flex-wrap gap-2">
          <GlassButton size="sm" variant="primary" onClick={testAppleCalendar} disabled={testing === 'apple'}>
            {testing === 'apple' ? <Loader2 className="w-4 h-4 animate-spin" /> : <Apple className="w-4 h-4" />}
            Add to Calendar
          </GlassButton>
          <GlassButton size="sm" variant="ghost" onClick={testAppleCalendar} disabled={testing === 'apple'}>
            <CalendarCheck className="w-4 h-4" /> Test connection
          </GlassButton>
        </div>
      </GlassCard>

      {/* Microsoft Outlook */}
      <GlassCard hover={false} className="p-0 overflow-hidden">
        <div className="p-5 flex items-start gap-4">
          <div className="w-11 h-11 rounded-xl bg-[#0078D4] shadow-sm flex items-center justify-center shrink-0">
            <OutlookIcon className="w-6 h-6" />
          </div>
          <div className="flex-1 min-w-0">
            <div className="flex items-center gap-2 flex-wrap">
              <h2 className="font-semibold">Microsoft Outlook</h2>
              <StatusBadge connected={outlookConnected} />
            </div>
            <p className="text-sm text-muted-foreground mt-1">
              {outlookConnected
                ? `Connected to ${outlookEmail}. Availability is checked against your Outlook calendar before booking slots are shown.`
                : 'Connect your Microsoft 365 or Outlook.com account (work, school, or personal) to check availability, prevent conflicts, and sync meetings.'}
            </p>

            {outlookConnected && (
              <div className="mt-4 space-y-3">
                <div className="text-sm space-y-1">
                  <div className="flex items-center gap-2 text-muted-foreground"><span className="text-xs font-medium uppercase tracking-wide">Account</span> {outlookEmail}</div>
                  <div className="flex items-center gap-2 text-muted-foreground"><span className="text-xs font-medium uppercase tracking-wide">Type</span> {outlookAccountType === 'microsoft_365' ? 'Microsoft 365 (Work/School)' : 'Personal (Outlook.com)'}</div>
                </div>
                <div className="flex flex-wrap gap-2">
                  {outlookCalendars.length ? outlookCalendars.map((c) => (
                    <span key={c} className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs glass">
                      <Calendar className="w-3 h-3" /> {c}
                    </span>
                  )) : <span className="text-xs text-muted-foreground">Checking all calendars</span>}
                </div>
                {outlookLastSynced && (
                  <div className="text-xs text-muted-foreground flex items-center gap-1.5">
                    <RefreshCw className="w-3 h-3" /> Last synced {new Date(outlookLastSynced).toLocaleString()}
                  </div>
                )}
                <label className="flex items-center gap-2.5 cursor-pointer pt-1">
                  <button
                    type="button"
                    onClick={toggleOutlookAutoSync}
                    className={`relative w-9 h-5 rounded-full transition-colors ${outlookAutoSync ? 'accent-bg' : 'bg-muted'}`}
                  >
                    <span className={`absolute top-0.5 w-4 h-4 rounded-full bg-white shadow transition-transform ${outlookAutoSync ? 'translate-x-4' : 'translate-x-0.5'}`} />
                  </button>
                  <span className="text-sm">Auto-sync new bookings to Outlook</span>
                </label>
              </div>
            )}
          </div>
        </div>

        <div className="px-5 pb-5 flex flex-wrap gap-2">
          {outlookConnected ? (
            <>
              <GlassButton size="sm" onClick={() => setShowOutlookSetup(true)}>
                <Settings2 className="w-4 h-4" /> Calendars
              </GlassButton>
              <GlassButton size="sm" onClick={syncOutlookNow} disabled={syncing}>
                {syncing ? <Loader2 className="w-4 h-4 animate-spin" /> : <RefreshCw className="w-4 h-4" />} Sync now
              </GlassButton>
              <GlassButton size="sm" variant="ghost" onClick={handleDisconnectOutlook}>
                <Unplug className="w-4 h-4" /> Disconnect
              </GlassButton>
            </>
          ) : (
            <GlassButton size="sm" variant="primary" onClick={handleConnectOutlook}>
              <Plug className="w-4 h-4" /> Connect
            </GlassButton>
          )}
        </div>
      </GlassCard>

      {/* WebCal / iCalendar Subscription */}
      <GlassCard hover={false} className="p-0 overflow-hidden">
        <div className="p-5">
          <div className="flex items-center gap-3 mb-1">
            <div className="w-10 h-10 rounded-xl glass flex items-center justify-center shrink-0">
              <Globe className="w-5 h-5 accent-text" />
            </div>
            <div>
              <h2 className="font-semibold">WebCal / iCalendar</h2>
              <p className="text-sm text-muted-foreground">Subscribe to any external calendar via a WebCal URL (read-only).</p>
            </div>
          </div>

          {/* Add subscription URL */}
          <div className="mt-4 flex gap-2">
            <GlassInput
              value={webcalUrl}
              onChange={(e) => setWebcalUrl(e.target.value)}
              placeholder="webcal://example.com/calendar.ics"
              className="flex-1"
            />
            <GlassButton size="sm" variant="primary" onClick={subscribeWebcal} disabled={webcalSubscribing || !webcalUrl}>
              {webcalSubscribing ? <Loader2 className="w-4 h-4 animate-spin" /> : <Plus className="w-4 h-4" />}
              Subscribe
            </GlassButton>
          </div>
          <p className="text-xs text-muted-foreground mt-2">Paste a WebCal URL from Outlook, Google, Apple, or any calendar that supports .ics feeds. The subscription is read-only — two-way sync requires a Microsoft account connection above.</p>
        </div>
      </GlassCard>

      {/* Calendar Subscriptions */}
      <GlassCard hover={false} className="p-0 overflow-hidden">
        <div className="p-5">
          <div className="flex items-center gap-3 mb-1">
            <div className="w-10 h-10 rounded-xl glass flex items-center justify-center shrink-0">
              <Rss className="w-5 h-5 accent-text" />
            </div>
            <div>
              <h2 className="font-semibold">Active Subscriptions</h2>
              <p className="text-sm text-muted-foreground">Your GlassMeet feed and WebCal subscriptions.</p>
            </div>
          </div>

          {subLoading ? (
            <div className="flex justify-center py-6"><Loader2 className="w-5 h-5 animate-spin text-muted-foreground" /></div>
          ) : subscriptions.filter((s) => s.active).length === 0 ? (
            <div className="mt-4 text-center py-6">
              <p className="text-sm text-muted-foreground mb-4">No active subscriptions. Create a GlassMeet feed or add a WebCal URL above.</p>
              <GlassButton size="sm" variant="primary" onClick={createSubscription}>
                <Rss className="w-4 h-4" /> Create GlassMeet Feed
              </GlassButton>
            </div>
          ) : (
            <div className="mt-4 space-y-3">
              {subscriptions.filter((s) => s.active).map((sub) => (
                <div key={sub.id} className="glass rounded-xl p-4">
                  <div className="flex items-center justify-between mb-2">
                    <div className="flex items-center gap-2">
                      <CheckCircle2 className="w-4 h-4 text-emerald-500" />
                      <span className="text-sm font-medium">{sub.name || 'Calendar feed'}</span>
                      {sub.subscription_type === 'webcal' && (
                        <span className="text-[10px] px-1.5 py-0.5 rounded-full bg-muted text-muted-foreground uppercase tracking-wide">WebCal</span>
                      )}
                    </div>
                    {sub.last_synced && (
                      <span className="text-xs text-muted-foreground">Updated {new Date(sub.last_synced).toLocaleDateString()}</span>
                    )}
                  </div>
                  {sub.webcal_url ? (
                    <div className="flex items-center gap-2 mb-3">
                      <code className="flex-1 text-xs text-muted-foreground glass rounded-lg px-3 py-2 truncate">
                        {sub.webcal_url}
                      </code>
                    </div>
                  ) : (
                    <div className="flex items-center gap-2 mb-3">
                      <code className="flex-1 text-xs text-muted-foreground glass rounded-lg px-3 py-2 truncate">
                        {window.location.origin}{appPath(`/calendar-feed/${sub.token.slice(0, 12)}…`)}
                      </code>
                    </div>
                  )}
                  <div className="flex flex-wrap gap-2">
                    {!sub.webcal_url && (
                      <GlassButton size="sm" onClick={() => copySubscriptionUrl(sub.token)}>
                        {copiedSub === sub.token ? <CheckCircle2 className="w-3.5 h-3.5 accent-text" /> : <Copy className="w-3.5 h-3.5" />}
                        {copiedSub === sub.token ? 'Copied' : 'Copy Link'}
                      </GlassButton>
                    )}
                    <GlassButton size="sm" onClick={() => downloadFeed(sub)}>
                      <Calendar className="w-3.5 h-3.5" /> Download .ics
                    </GlassButton>
                    <GlassButton size="sm" variant="ghost" onClick={() => regenerateToken(sub.id)}>
                      <RotateCcw className="w-3.5 h-3.5" /> Regenerate
                    </GlassButton>
                    <GlassButton size="sm" variant="ghost" onClick={() => revokeSubscription(sub.id)}>
                      <Trash2 className="w-3.5 h-3.5" /> Revoke
                    </GlassButton>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      </GlassCard>

      {/* How availability works */}
      <GlassCard hover={false}>
        <div className="flex items-start gap-3">
          <Shield className="w-5 h-5 accent-text mt-0.5 shrink-0" />

          <div>
            <h3 className="font-medium text-sm">Google Calendar sync</h3>
            <ul className="text-sm text-muted-foreground mt-2 space-y-1.5 list-disc list-inside">
              <li>Booking slots avoid busy times from the selected Google calendar and existing GlassMeet bookings.</li>
              <li>Guests receive only available time slots; Google event titles and details stay private.</li>
              <li>Confirmed bookings can be added automatically to your selected Google calendar.</li>
              <li>Use Sync now to add existing confirmed bookings that have not been synced yet.</li>
            </ul>
          </div>
        </div>
      </GlassCard>

      {showGoogleSetup && (
        <GoogleSetupModal
          connected={googleConnected}
          calendars={googleCalendarsList}
          selectedCalendarId={googleAccount.calendar_id || 'primary'}
          onClose={() => setShowGoogleSetup(false)}
          onSave={async (calendarId) => {
            const result = await api.google.saveSettings({ calendarId, autoSync });
            setGoogleAccount((current) => ({ ...current, connected: true, calendar_id: result.calendarId, calendar_name: result.calendarName, auto_sync: result.autoSync }));
            setShowGoogleSetup(false);
          }}
        />
      )}

      {showOutlookSetup && (
        <OutlookSetupModal
          connected={outlookConnected}
          selectedCalendars={outlookCalendars}
          accountEmail={outlookEmail}
          accountType={outlookAccountType}
          onClose={() => setShowOutlookSetup(false)}
          onSave={async (cals, accountType) => {
            await updateProfile({
              outlook_calendars: cals,
              outlook_connected: true,
              outlook_last_synced: new Date().toISOString(),
              outlook_account_type: accountType || 'outlook_com',
            });
            setShowOutlookSetup(false);
          }}
        />
      )}
    </div>
  );
}

function StatusBadge({ connected }) {
  return connected ? (
    <span className="inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full text-xs glass text-emerald-600 dark:text-emerald-400">
      <CheckCircle2 className="w-3 h-3" /> Connected
    </span>
  ) : (
    <span className="inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full text-xs glass text-muted-foreground">
      <AlertCircle className="w-3 h-3" /> Not connected
    </span>
  );
}

function SummaryStat({ icon: Icon, label, value, hint, className }) {
  return (
    <div className={`glass-panel p-4 ${className || ''}`}>
      <div className="flex items-center gap-2 text-muted-foreground mb-1">
        <Icon className="w-3.5 h-3.5" />
        <span className="text-xs font-medium uppercase tracking-wide">{label}</span>
      </div>
      <div className="text-lg font-semibold leading-tight">{value}</div>
      {hint && <div className="text-xs text-muted-foreground mt-0.5">{hint}</div>}
    </div>
  );
}

function GoogleSetupModal({ connected, calendars, selectedCalendarId, onClose, onSave }) {
  const [selected, setSelected] = useState(selectedCalendarId);

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/30 backdrop-blur-sm animate-fade-in" onClick={onClose}>
      <div className="glass-panel max-w-md w-full p-6 animate-scale-in" onClick={(e) => e.stopPropagation()}>
        <div className="flex items-center gap-3 mb-4">
          <div className="w-10 h-10 rounded-xl bg-white shadow-sm flex items-center justify-center"><GoogleG /></div>
          <div>
            <h3 className="font-semibold">Google Calendar</h3>
            <p className="text-xs text-muted-foreground">{connected ? 'Select calendars to check for conflicts' : 'OAuth authorization required'}</p>
          </div>
        </div>

        {connected ? (
          <>
            <p className="text-sm text-muted-foreground mb-3">Choose the calendar where GlassMeet should create confirmed bookings.</p>
            <div className="space-y-2 mb-5">
              {calendars.map((calendar) => (
                <label key={calendar.id} className="flex items-center gap-3 p-2.5 rounded-xl glass cursor-pointer">
                  <input type="radio" name="google-calendar" checked={selected === calendar.id} onChange={() => setSelected(calendar.id)} className="accent-[hsl(var(--accent-color))]" />
                  <Calendar className="w-4 h-4 text-muted-foreground" />
                  <span className="text-sm">{calendar.summary}{calendar.primary ? ' (primary)' : ''}</span>
                </label>
              ))}
            </div>
            <div className="flex gap-2 justify-end">
              <GlassButton size="sm" variant="ghost" onClick={onClose}>Cancel</GlassButton>
              <GlassButton size="sm" variant="primary" onClick={() => onSave(selected)} disabled={!selected}>Save</GlassButton>
            </div>
          </>
        ) : (
          <>
            <div className="glass rounded-xl p-4 mb-4 flex gap-3">
              <AlertCircle className="w-5 h-5 text-amber-500 shrink-0 mt-0.5" />
              <div className="text-sm space-y-2">
                <p className="font-medium">Connect a Google account to choose a calendar.</p>
                <p className="text-muted-foreground text-xs">GlassMeet stores the Google refresh token encrypted on this server and creates events in the selected calendar.</p>
              </div>
            </div>
            <div className="flex justify-end">
              <GlassButton size="sm" variant="ghost" onClick={onClose}>Close</GlassButton>
            </div>
          </>
        )}
      </div>
    </div>
  );
}

function GoogleG() {
  return (
    <svg viewBox="0 0 24 24" className="w-6 h-6">
      <path fill="#4285F4" d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z" />
      <path fill="#34A853" d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z" />
      <path fill="#FBBC05" d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l3.66-2.84z" />
      <path fill="#EA4335" d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84C6.71 7.31 9.14 5.38 12 5.38z" />
    </svg>
  );
}

function OutlookSetupModal({ connected, selectedCalendars, accountEmail, accountType, onClose, onSave }) {
  const [selected, setSelected] = useState(selectedCalendars);
  const [acctType, setAcctType] = useState(accountType || 'outlook_com');
  const calendars = ['Calendar', 'Work', 'Personal', 'Family', 'Team'];

  const toggle = (cal) => setSelected((s) => s.includes(cal) ? s.filter((c) => c !== cal) : [...s, cal]);

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/30 backdrop-blur-sm animate-fade-in" onClick={onClose}>
      <div className="glass-panel max-w-md w-full p-6 animate-scale-in" onClick={(e) => e.stopPropagation()}>
        <div className="flex items-center gap-3 mb-4">
          <div className="w-10 h-10 rounded-xl bg-[#0078D4] shadow-sm flex items-center justify-center"><OutlookIcon className="w-6 h-6" /></div>
          <div>
            <h3 className="font-semibold">Microsoft Outlook</h3>
            <p className="text-xs text-muted-foreground">{connected ? 'Select calendars to check for conflicts' : 'OAuth authorization required'}</p>
          </div>
        </div>

        {connected ? (
          <>
            {accountEmail && (
              <div className="glass rounded-xl p-3 mb-3 flex items-center gap-2">
                <CheckCircle2 className="w-4 h-4 text-emerald-500 shrink-0" />
                <div>
                  <div className="text-sm font-medium">{accountEmail}</div>
                  <div className="text-xs text-muted-foreground">{acctType === 'microsoft_365' ? 'Microsoft 365 (Work/School)' : 'Personal (Outlook.com)'}</div>
                </div>
              </div>
            )}
            <p className="text-sm text-muted-foreground mb-3">Choose which Outlook calendars GlassMeet checks when showing available slots.</p>
            <div className="space-y-2 mb-5">
              {calendars.map((cal) => (
                <label key={cal} className="flex items-center gap-3 p-2.5 rounded-xl glass cursor-pointer">
                  <input type="checkbox" checked={selected.includes(cal)} onChange={() => toggle(cal)} className="accent-[#0078D4]" />
                  <Calendar className="w-4 h-4 text-muted-foreground" />
                  <span className="text-sm">{cal}</span>
                </label>
              ))}
            </div>
            <div className="flex gap-2 justify-end">
              <GlassButton size="sm" variant="ghost" onClick={onClose}>Cancel</GlassButton>
              <GlassButton size="sm" variant="primary" onClick={() => onSave(selected, acctType)}>Save</GlassButton>
            </div>
          </>
        ) : (
          <>
            <div className="glass rounded-xl p-4 mb-4 flex gap-3">
              <AlertCircle className="w-5 h-5 text-amber-500 shrink-0 mt-0.5" />
              <div className="text-sm space-y-2">
                <p className="font-medium">Microsoft Outlook two-way sync requires OAuth setup.</p>
                <p className="text-muted-foreground text-xs">
                  Connecting your Microsoft account uses secure OAuth 2.0 with Microsoft Graph API
                  (scopes: <code>Calendars.Read</code>, <code>Calendars.ReadWrite</code>).
                  This requires a Builder+ plan and a Microsoft OAuth client configured in your workspace.
                </p>
              </div>
            </div>
            <div className="glass rounded-xl p-3 mb-4">
              <p className="text-xs font-medium mb-2">Account type</p>
              <div className="flex gap-2">
                <button onClick={() => setAcctType('microsoft_365')} className={`flex-1 glass-button rounded-xl px-3 py-2.5 text-sm ${acctType === 'microsoft_365' ? 'accent-border accent-text' : ''}`}>
                  Microsoft 365<br /><span className="text-xs text-muted-foreground">Work / School</span>
                </button>
                <button onClick={() => setAcctType('outlook_com')} className={`flex-1 glass-button rounded-xl px-3 py-2.5 text-sm ${acctType === 'outlook_com' ? 'accent-border accent-text' : ''}`}>
                  Outlook.com<br /><span className="text-xs text-muted-foreground">Personal</span>
                </button>
              </div>
            </div>
            <p className="text-xs text-muted-foreground mb-4">
              Use the <strong>connection card in chat</strong> to authorize your Microsoft account securely.
              We never store your password. Outlook.com, Hotmail, and Live.com accounts are all supported.
            </p>
            <div className="flex justify-end">
              <GlassButton size="sm" variant="ghost" onClick={onClose}>Close</GlassButton>
            </div>
          </>
        )}
      </div>
    </div>
  );
}
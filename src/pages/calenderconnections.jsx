import React, { useState, useEffect } from 'react';
import { useSearchParams } from 'react-router-dom';
import { toast } from 'sonner';
import {
  Calendar, CalendarCheck, RefreshCw, Unplug, CheckCircle2,
  AlertCircle, Loader2, Settings2,
  Rss, Copy, RotateCcw, Clock,
} from 'lucide-react';
import { GlassCard, GlassButton, GlassInput, PageHeader } from '@/components/glass';
import { Switch } from '@/components/ui/switch';
import { api } from '@/lib/localApi';
import { useApp } from '@/lib/useprofile.js';
import { downloadIcs } from '@/lib/calendar';
import { downloadICSFeed } from '@/lib/calendarFeed';
import OutlookIcon from '@/components/outlookicon.jsx';
import AppleIcon from '@/components/appleicon.jsx';
import { getCalendarPriority } from '@/lib/devicedetect.js';
import { Dialog, DialogContent, DialogTitle } from '@/components/ui/dialog';

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

const GOOGLE_UNAVAILABLE = 'Google Calendar isn’t available yet.';
const unavailable = (error) => error?.code === 'not_configured' || error?.code === 'unavailable';
// what to say when Google sends the host back without a connection (?google=error&reason=...)
const GOOGLE_RETURN_ERRORS = {
  denied: 'Google Calendar wasn’t connected: access was not allowed.',
  state: 'That Google sign-in expired. Try connecting again.',
};
// Google's code is single use; StrictMode's second effect run must not send it again
const finishedGoogleCodes = new Set();
const CONNECT_RETURN_ERRORS = {
  denied: 'It wasn’t connected: access was not allowed.',
  state: 'That sign-in expired. Try connecting again.',
};

export default function CalendarConnections() {
  const { profile, updateProfile } = useApp();
  const [searchParams, setSearchParams] = useSearchParams();
  const [showGoogleSetup, setShowGoogleSetup] = useState(false);
  const [googleAccount, setGoogleAccount] = useState({ connected: false });
  const [googleLoading, setGoogleLoading] = useState(true);
  const [googleCalendarsList, setGoogleCalendarsList] = useState(null); // null: not loaded yet
  const [googleError, setGoogleError] = useState('');
  const [googleUnavailable, setGoogleUnavailable] = useState(false);
  const [googleBusy, setGoogleBusy] = useState(''); // 'connect' | 'finish' | 'settings' | 'disconnect'
  const [testing, setTesting] = useState(false);
  const [testResult, setTestResult] = useState(null);
  const [syncing, setSyncing] = useState(false);
  const [feedToken, setFeedToken] = useState('');
  const [feedState, setFeedState] = useState('loading');
  const [feedError, setFeedError] = useState('');
  const [copiedFeed, setCopiedFeed] = useState(false);
  const [feedResetting, setFeedResetting] = useState(false);

  const googleConnected = Boolean(googleAccount.connected);
  const googleReconnect = Boolean(googleAccount.needsReconnect);
  const autoSync = googleAccount.auto_sync ?? true;
  const calendarLabel = googleAccount.calendar_name
    || (!googleAccount.calendar_id || googleAccount.calendar_id === 'primary' ? 'Primary calendar' : googleAccount.calendar_id);
  const lastSynced = googleAccount.synced_date;

  // Microsoft: the connections edge function
  const [connections, setConnections] = useState({});
  const [connectionsAvailable, setConnectionsAvailable] = useState(null); // null: not known yet

  const refreshConnections = () => api.connections.list().then(setConnections);

  useEffect(() => {
    refreshConnections();
    api.connections.available().then(setConnectionsAvailable);

    // Back from Microsoft: finished here by the signed-in host, as with Google
    const result = searchParams.get('connect');
    if (!result) return;
    const code = searchParams.get('code');
    const state = searchParams.get('state');
    const reason = searchParams.get('reason');
    const rest = new URLSearchParams(searchParams);
    ['connect', 'provider', 'code', 'state', 'reason'].forEach((key) => rest.delete(key));
    setSearchParams(rest, { replace: true });
    if (result === 'error') {
      toast.error(CONNECT_RETURN_ERRORS[reason] || 'It wasn’t connected. Try again.');
    } else if (result === 'finish' && code && state && !finishedGoogleCodes.has(code)) {
      finishedGoogleCodes.add(code);
      api.connections.finish(code, state)
        .then((done) => toast.success(done?.email ? `Connected (${done.email}).` : 'Connected.'))
        .catch((error) => toast.error(error?.message || 'It wasn’t connected. Try again.'))
        .finally(refreshConnections);
    }
    // once, for the address the page opened with
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Device-aware calendar ordering
  const calendarPriority = getCalendarPriority();

  const refreshGoogle = async () => {
    try {
      setGoogleAccount(await api.google.status());
    } finally {
      setGoogleLoading(false);
    }
  };

  // "not set up yet" shows on the card; anything else as a message (and a toast when asked)
  const showGoogleError = (error, toastPrefix) => {
    if (unavailable(error)) { setGoogleUnavailable(true); setGoogleError(''); return; }
    if (error?.code === 'reconnect' || error?.code === 'not_connected') refreshGoogle();
    setGoogleError(error?.message || 'Google Calendar didn’t respond.');
    if (toastPrefix) toast.error(`${toastPrefix} ${error?.message || ''}`.trim());
  };

  // Back from Google: ?google=finish&code=&state= is finished here, by the signed-in host;
  // ?google=error&reason= says what went wrong
  useEffect(() => {
    const result = searchParams.get('google');
    if (!result) { refreshGoogle(); return; }
    const code = searchParams.get('code');
    const state = searchParams.get('state');
    const reason = searchParams.get('reason');
    // the code must not stay in the address bar or the history
    const rest = new URLSearchParams(searchParams);
    ['google', 'code', 'state', 'reason'].forEach((key) => rest.delete(key));
    setSearchParams(rest, { replace: true });

    if (result === 'finish' && code && state) {
      if (finishedGoogleCodes.has(code)) return;
      finishedGoogleCodes.add(code);
      setGoogleBusy('finish');
      api.google.finish(code, state)
        .then((done) => {
          toast.success(done?.email ? `Google Calendar connected (${done.email}).` : 'Google Calendar connected.');
          setGoogleError('');
        })
        .catch((error) => showGoogleError(error, 'Could not connect Google Calendar.'))
        .finally(() => { setGoogleBusy(''); refreshGoogle(); });
      return;
    }
    if (result === 'connected') toast.success('Google Calendar connected.');
    else if (result === 'error') toast.error(GOOGLE_RETURN_ERRORS[reason] || 'Google Calendar wasn’t connected. Try again.');
    refreshGoogle();
    // once, for the address the page opened with
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const handleConnectGoogle = async () => {
    setGoogleBusy('connect');
    setGoogleError('');
    try {
      await api.google.connect('/calendar-connections');
      // leaving for Google; the button stays busy until the page goes
    } catch (error) {
      showGoogleError(error);
      setGoogleBusy('');
    }
  };

  // a failed save says so instead of failing silently
  const attempt = (work, failMessage) => async (...args) => {
    try { await work(...args); } catch (error) { toast.error(`${failMessage} ${error?.message || ''}`.trim()); }
  };

  const handleDisconnectGoogle = async () => {
    if (!confirm('Disconnect Google Calendar? Busy times in Google stop hiding slots and new bookings stop being added. Events already in Google stay there.')) return;
    setGoogleBusy('disconnect');
    try {
      await api.google.disconnect();
      setGoogleAccount({ connected: false });
      setGoogleCalendarsList(null);
      setGoogleError('');
      setTestResult(null);
      toast.success('Google Calendar disconnected.');
    } catch (error) {
      showGoogleError(error, 'Could not disconnect Google Calendar.');
    } finally {
      setGoogleBusy('');
    }
  };

  const toggleAutoSync = async () => {
    const next = !autoSync;
    setGoogleAccount((current) => ({ ...current, auto_sync: next }));
    try {
      const result = await api.google.saveSettings({ autoSync: next });
      setGoogleAccount((current) => ({ ...current, auto_sync: result.autoSync }));
    } catch (error) {
      setGoogleAccount((current) => ({ ...current, auto_sync: !next }));
      showGoogleError(error, 'Could not change auto-sync.');
    }
  };

  const openGoogleCalendars = async () => {
    setShowGoogleSetup(true);
    if (googleCalendarsList) return;
    try {
      setGoogleCalendarsList(await api.google.calendars());
    } catch (error) {
      setShowGoogleSetup(false);
      showGoogleError(error, 'Could not load your Google calendars.');
    }
  };

  const saveGoogleCalendar = async (calendarId) => {
    setGoogleBusy('settings');
    try {
      const result = await api.google.saveSettings({ calendarId });
      setGoogleAccount((current) => ({ ...current, calendar_id: result.calendarId, calendar_name: result.calendarName, auto_sync: result.autoSync }));
      setShowGoogleSetup(false);
      toast.success('Calendar saved. Sync now moves upcoming meetings there.');
    } catch (error) {
      showGoogleError(error, 'Could not save your calendar choice.');
    } finally {
      setGoogleBusy('');
    }
  };

  const syncNow = async () => {
    setSyncing(true);
    setGoogleError('');
    try {
      const result = await api.google.sync();
      const changed = (result?.created || 0) + (result?.updated || 0) + (result?.deleted || 0);
      if (result?.failed) toast.error(`${result.failed} meeting${result.failed === 1 ? '' : 's'} could not be synced. Try again later.`);
      else toast.success(changed ? `Synced ${changed} meeting${changed === 1 ? '' : 's'} to Google Calendar.` : 'Google Calendar is up to date.');
      setGoogleAccount((current) => ({ ...current, synced_date: result?.syncedDate || new Date().toISOString() }));
    } catch (error) {
      showGoogleError(error, 'Could not sync Google Calendar.');
    } finally {
      setSyncing(false);
    }
  };

  const testGoogle = async () => {
    setTesting('google');
    try {
      setGoogleCalendarsList(await api.google.calendars());
      setTestResult({ type: 'google', ok: true });
      setGoogleError('');
    } catch (error) {
      showGoogleError(error);
      setTestResult({ type: 'google', ok: false });
    } finally {
      setTesting(null);
    }
  };

  const testAppleCalendar = () => {
    setTesting('apple-test');
    setTimeout(() => {
      downloadIcs(SAMPLE_BOOKING, SAMPLE_EVENT, { full_name: profile?.full_name || 'Host' });
      setTestResult({ type: 'apple', ok: true, message: 'Test event downloaded. Open it to check your calendar app accepts GlassMeet events.' });
      setTesting(null);
    }, 600);
  };

  // One .ics with every upcoming confirmed meeting, for Apple Calendar or any calendar app
  const exportMyMeetings = async () => {
    setTesting('apple');
    try {
      // from a day back: a meeting that started earlier and is still running counts too
      const since = new Date(Date.now() - 86400000).toISOString();
      const all = await api.entities.Booking.filter({ host_id: profile.id, start_time: { gte: since } }, 'start_time', 1000);
      const now = Date.now();
      const upcoming = all.filter((b) => b.status !== 'cancelled' && b.approval_status !== 'pending' && new Date(b.end_time || b.start_time).getTime() >= now);
      if (!upcoming.length) {
        setTestResult({ type: 'apple', ok: false, message: 'No upcoming meetings to add yet. New bookings will appear here.' });
      } else {
        downloadICSFeed(upcoming, 'glassmeet-meetings.ics', `GlassMeet: ${profile?.full_name || 'Meetings'}`);
        setTestResult({ type: 'apple', ok: true, message: `Downloaded ${upcoming.length} upcoming meeting${upcoming.length === 1 ? '' : 's'}. Open the file to add ${upcoming.length === 1 ? 'it' : 'them'} to your calendar.` });
      }
    } catch (error) {
      setTestResult({ type: 'apple', ok: false, message: `Could not load your meetings: ${error.message}` });
    } finally {
      setTesting(null);
    }
  };

  // Subscription feed: created on first visit, one per host
  const feedUrl = feedToken ? api.calendarFeed.urlFor(feedToken) : '';

  useEffect(() => {
    api.calendarFeed.mine()
      .then((token) => { setFeedToken(token); setFeedState('ready'); })
      .catch((error) => {
        // only a missing table; other errors also name cal_feeds, and need their real message
        setFeedError(/relation .* does not exist|schema cache/i.test(error.message)
          ? 'Calendar subscriptions are not set up on the server yet.'
          : `Could not load your subscription link: ${error.message}`);
        setFeedState('error');
      });
  }, []);

  const copyFeedUrl = async () => {
    try { await navigator.clipboard.writeText(feedUrl); } catch { toast.error('Couldn’t copy the link. Select it and copy it instead.'); return; }
    setCopiedFeed(true);
    setTimeout(() => setCopiedFeed(false), 2000);
  };

  const resetFeed = async () => {
    if (!confirm('Reset your subscription link? Calendars using the current link will stop updating until you subscribe again with the new one.')) return;
    setFeedResetting(true);
    try {
      setFeedToken(await api.calendarFeed.rotate());
    } catch (error) {
      // the current link still works, so keep showing it
      toast.error(`Could not reset the link: ${error.message}`);
    }
    setFeedResetting(false);
  };

  return (
    <div className="space-y-6 animate-fade-in">
      <PageHeader title="Calendars" description="Keep your meetings in the calendar you already use, and create a video link for each booking." />

      {/* Subscribe: one auto-updating feed per host */}
      <GlassCard hover={false} className="p-0 overflow-hidden">
        <div className="p-5 flex items-start gap-4">
          <div className="w-11 h-11 rounded-full bg-primary-soft flex items-center justify-center shrink-0">
            <Rss className="w-5 h-5 text-link" />
          </div>
          <div className="flex-1 min-w-0">
            <div className="flex items-center gap-2 flex-wrap">
              <h2 className="text-[17px] font-bold">Subscribe to your GlassMeet calendar</h2>
              <span className="inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full text-xs font-semibold bg-secondary text-success">
                <RefreshCw className="w-3 h-3" /> Auto-updates
              </span>
            </div>
            <p className="text-sm text-muted-foreground mt-1">
              Add this link to your calendar app once. New bookings and cancellations then show up on their own. Apple Calendar refreshes about every hour; Google Calendar can take up to a day.
            </p>

            {feedState === 'loading' && (
              <div className="mt-4 flex items-center gap-2 text-sm text-muted-foreground"><Loader2 className="w-4 h-4 animate-spin" /> Preparing your link…</div>
            )}
            {feedState === 'error' && (
              <p role="alert" className="mt-4 text-sm text-destructive">{feedError}</p>
            )}
            {feedState === 'ready' && feedUrl && (
              <>
                <div className="mt-4 flex gap-2">
                  <GlassInput value={feedUrl} readOnly onFocus={(e) => e.target.select()} aria-label="Calendar subscription link" className="min-w-0 flex-1 font-mono text-base sm:text-xs" />
                  <GlassButton type="button" variant="brand" onClick={copyFeedUrl}>
                    {copiedFeed ? <><CheckCircle2 className="w-4 h-4" /> Copied</> : <><Copy className="w-4 h-4" /> Copy</>}
                  </GlassButton>
                </div>
                <p className="mt-2 text-xs text-muted-foreground">
                  Anyone with this link can see your meeting times and guest details. Keep it private, and reset it if it gets shared.
                </p>
              </>
            )}
          </div>
        </div>
        {feedState === 'ready' && feedUrl && (
          <div className="px-5 pb-5 flex flex-wrap gap-2">
            <GlassButton as="a" href={feedUrl.replace(/^https:/, 'webcal:')} size="sm" variant="primary"><AppleIcon className="w-4 h-4" /> Apple Calendar</GlassButton>
            <GlassButton as="a" href={`https://calendar.google.com/calendar/r?cid=${encodeURIComponent(feedUrl.replace(/^https:/, 'webcal:'))}`} target="_blank" rel="noreferrer" size="sm"><Calendar className="w-4 h-4" /> Google Calendar</GlassButton>
            <GlassButton as="a" href={`https://outlook.live.com/calendar/0/addfromweb?url=${encodeURIComponent(feedUrl)}&name=${encodeURIComponent('GlassMeet')}`} target="_blank" rel="noreferrer" size="sm"><OutlookIcon className="w-4 h-4" /> Outlook</GlassButton>
            <GlassButton size="sm" variant="ghost" type="button" onClick={resetFeed} disabled={feedResetting}>
              {feedResetting ? <Loader2 className="w-4 h-4 animate-spin" /> : <RotateCcw className="w-4 h-4" />} Reset link
            </GlassButton>
          </div>
        )}
      </GlassCard>

      {/* Google Calendar */}
      <GlassCard hover={false} className="p-0 overflow-hidden">
        <div className="p-5 flex items-start gap-4">
          <div className="w-11 h-11 rounded-lg border border-border bg-white flex items-center justify-center shrink-0">
            <GoogleG />
          </div>
          <div className="flex-1 min-w-0">
            <div className="flex items-center gap-2 flex-wrap">
              <h2 className="text-[17px] font-bold">Google Calendar</h2>
              {googleLoading ? null
                : googleConnected ? <StatusBadge connected />
                  : googleReconnect ? <ReconnectBadge />
                    : googleUnavailable ? <ComingSoonBadge /> : <StatusBadge connected={false} />}
            </div>
            <p className="text-sm text-muted-foreground mt-1">
              {googleConnected
                ? `Connected${googleAccount.email ? ` to ${googleAccount.email}` : ''}. Times you’re busy in Google are hidden from your booking pages${autoSync ? ', and new bookings are added to Google Calendar' : ''}. Events held on Google Meet get a new Meet link for each booking.`
                : googleReconnect
                  ? `Google stopped accepting the connection${googleAccount.email ? ` to ${googleAccount.email}` : ''}. Connect again to keep busy times and bookings in sync.`
                  : googleUnavailable
                    ? `${GOOGLE_UNAVAILABLE} Until then, guests can add meetings to Google Calendar from their confirmation page.`
                    : 'Connect Google Calendar so times you’re busy stay off your booking pages, new bookings are added to your calendar, and events held on Google Meet get a link for each booking.'}
            </p>

            {googleLoading && (
              <div className="mt-4 flex items-center gap-2 text-sm text-muted-foreground"><Loader2 className="w-4 h-4 animate-spin" /> Checking your connection…</div>
            )}
            {googleBusy === 'finish' && (
              <div role="status" className="mt-4 flex items-center gap-2 text-sm text-muted-foreground"><Loader2 className="w-4 h-4 animate-spin" /> Finishing the connection…</div>
            )}

            {googleConnected && (
              <div className="mt-4 space-y-3">
                <div className="flex flex-wrap gap-2">
                  <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-semibold bg-secondary">
                    <Calendar className="w-3 h-3" /> {calendarLabel}
                  </span>
                </div>
                {lastSynced && (
                  <div className="text-xs text-muted-foreground flex items-center gap-1.5">
                    <RefreshCw className="w-3 h-3" /> Last synced {new Date(lastSynced).toLocaleString()}
                  </div>
                )}
                {testResult?.type === 'google' && testResult.ok && (
                  <p className="text-xs text-success flex items-center gap-1.5">
                    <CheckCircle2 className="w-3 h-3" /> Connection verified.
                  </p>
                )}
                <label className="flex items-center gap-2.5 cursor-pointer pt-1">
                  <Switch checked={autoSync} onCheckedChange={toggleAutoSync} />
                  <span className="text-sm">Auto-sync new bookings to Google</span>
                </label>
              </div>
            )}
            {googleError && <p role="alert" className="mt-3 text-xs text-destructive">{googleError}</p>}
          </div>
        </div>

        {!googleLoading && (
          <div className="px-5 pb-5 flex flex-wrap gap-2">
            {googleConnected ? (
              <>
                <GlassButton size="sm" type="button" onClick={openGoogleCalendars}>
                  <Settings2 className="w-4 h-4" /> Calendar
                </GlassButton>
                <GlassButton size="sm" type="button" onClick={syncNow} disabled={syncing}>
                  {syncing ? <Loader2 className="w-4 h-4 animate-spin" /> : <RefreshCw className="w-4 h-4" />} Sync now
                </GlassButton>
                <GlassButton size="sm" type="button" variant="ghost" onClick={testGoogle} disabled={testing === 'google'}>
                  {testing === 'google' ? <Loader2 className="w-4 h-4 animate-spin" /> : <CheckCircle2 className="w-4 h-4" />} Test
                </GlassButton>
                <GlassButton size="sm" type="button" variant="ghost" onClick={handleDisconnectGoogle} disabled={googleBusy === 'disconnect'}>
                  {googleBusy === 'disconnect' ? <Loader2 className="w-4 h-4 animate-spin" /> : <Unplug className="w-4 h-4" />} Disconnect
                </GlassButton>
              </>
            ) : googleUnavailable ? (
              <ComingSoonButton label="Google Calendar" />
            ) : (
              <GlassButton size="sm" type="button" variant="primary" onClick={handleConnectGoogle} disabled={googleBusy === 'connect' || googleBusy === 'finish'}>
                {googleBusy === 'connect' ? <Loader2 className="w-4 h-4 animate-spin" /> : <CalendarCheck className="w-4 h-4" />}
                {googleReconnect ? 'Reconnect Google Calendar' : 'Connect Google Calendar'}
              </GlassButton>
            )}
          </div>
        )}
      </GlassCard>

      {/* Apple Calendar */}
      <GlassCard hover={false} className="p-0 overflow-hidden">
        <div className="p-5 flex items-start gap-4">
          <div className="w-11 h-11 rounded-lg bg-black border border-border flex items-center justify-center shrink-0">
            <AppleIcon className="w-6 h-6 text-white" />
          </div>
          <div className="flex-1 min-w-0">
            <div className="flex items-center gap-2 flex-wrap">
              <h2 className="text-[17px] font-bold">Apple Calendar</h2>
              <span className="inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full text-xs font-semibold bg-secondary text-success">
                <CheckCircle2 className="w-3 h-3" /> Always available
              </span>
            </div>
            <p className="text-sm text-muted-foreground mt-1">
              Add your upcoming meetings to Apple Calendar on iPhone, iPad and Mac with a standard <code className="text-xs">.ics</code> file. No account connection required. Download again to pick up new bookings.
            </p>
            {testResult?.type === 'apple' && (
              <p role="status" className={`text-xs mt-2 flex items-center gap-1.5 ${testResult.ok ? 'text-success' : 'text-muted-foreground'}`}>
                {testResult.ok ? <CheckCircle2 className="w-3 h-3 shrink-0" /> : <AlertCircle className="w-3 h-3 shrink-0" />} {testResult.message}
              </p>
            )}
          </div>
        </div>
        <div className="px-5 pb-5 flex flex-wrap gap-2">
          <GlassButton size="sm" variant="primary" type="button" onClick={exportMyMeetings} disabled={!!testing}>
            {testing === 'apple' ? <Loader2 className="w-4 h-4 animate-spin" /> : <AppleIcon className="w-4 h-4" />}
            Add my meetings
          </GlassButton>
          <GlassButton size="sm" variant="ghost" type="button" onClick={testAppleCalendar} disabled={!!testing}>
            {testing === 'apple-test' ? <Loader2 className="w-4 h-4 animate-spin" /> : <CalendarCheck className="w-4 h-4" />} Download test event
          </GlassButton>
        </div>
      </GlassCard>

      <ConnectionCard
        provider="microsoft"
        title="Microsoft Outlook and Teams"
        icon={<div className="w-11 h-11 rounded-lg bg-[#0078D4] shadow-xs flex items-center justify-center shrink-0"><OutlookIcon className="w-6 h-6" /></div>}
        account={connections.microsoft}
        available={connectionsAvailable?.microsoft}
        pitch="Connect a Microsoft 365 or Outlook.com account so times you’re busy stay off your booking pages and new bookings are added to your calendar. Events held on Microsoft Teams get a link for each booking, with a work or school account."
        unavailable="Microsoft isn’t available yet. Until then, guests can add meetings to Outlook from their confirmation page."
        describe={(account) => `Times you’re busy in Outlook are hidden from your booking pages${account.auto_sync ? ', and new bookings are added to Outlook' : ''}. ${account.teams ? 'Events held on Microsoft Teams get a new link for each booking.' : 'This account can’t create Teams meetings, which need a work or school account.'}`}
        autoSyncLabel="Auto-sync new bookings to Outlook"
        onChanged={refreshConnections}
      />

      {showGoogleSetup && (
        <GoogleSetupModal
          calendars={googleCalendarsList}
          selectedCalendarId={googleAccount.calendar_id || 'primary'}
          saving={googleBusy === 'settings'}
          onClose={() => setShowGoogleSetup(false)}
          onSave={saveGoogleCalendar}
        />
      )}

    </div>
  );
}

// One connection, Microsoft for now. The account row is read directly; the rest goes through the
// connections edge function.
function ConnectionCard({ provider, title, icon, account, available, pitch, unavailable, describe, autoSyncLabel, onChanged }) {
  const [busy, setBusy] = useState('');
  const [error, setError] = useState('');
  const connected = Boolean(account?.connected);
  const reconnect = Boolean(account) && !connected;
  const failed = (work, name) => async () => {
    setBusy(name);
    setError('');
    try {
      await work();
    } catch (e) {
      setError(e?.message || 'The connection didn’t respond.');
      if (e?.code === 'reconnect' || e?.code === 'not_connected') onChanged();
    }
    setBusy('');
  };
  // leaving for the provider; the button stays busy until the page goes
  const connect = failed(async () => {
    await api.connections.connect(provider);
    await new Promise(() => {});
  }, 'connect');
  const sync = failed(async () => {
    const result = await api.connections.sync(provider);
    if (result?.failed) toast.error(`${result.failed} meeting${result.failed === 1 ? '' : 's'} could not be synced. Try again later.`);
    else toast.success(result?.changed ? `Updated ${result.changed} meeting${result.changed === 1 ? '' : 's'}.` : 'Everything is up to date.');
    await onChanged();
  }, 'sync');
  const toggleSync = failed(async () => {
    await api.connections.saveSettings(provider, !account.auto_sync);
    await onChanged();
  }, 'settings');
  const disconnect = async () => {
    if (!confirm(`Disconnect ${title}? New bookings stop using it. Meetings and events it already made stay, and links already sent keep working.`)) return;
    await failed(async () => {
      await api.connections.disconnect(provider);
      toast.success(`${title} disconnected.`);
      await onChanged();
    }, 'disconnect')();
  };

  return (
    <GlassCard hover={false} className="p-0 overflow-hidden">
      <div className="p-5 flex items-start gap-4">
        {icon}
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 flex-wrap">
            <h2 className="text-[17px] font-bold">{title}</h2>
            {available === null || available === undefined ? null
              : connected ? <StatusBadge connected />
                : reconnect ? <ReconnectBadge />
                  : available ? <StatusBadge connected={false} /> : <ComingSoonBadge />}
          </div>
          <p className="text-sm text-muted-foreground mt-1">
            {connected
              ? `Connected${account.email ? ` to ${account.email}` : ''}. ${describe(account)}`
              : reconnect
                ? `${title} stopped accepting the connection${account.email ? ` to ${account.email}` : ''}. Connect again to keep it working.`
                : available === false ? unavailable : pitch}
          </p>
          {connected && account.synced_date && (
            <div className="mt-3 text-xs text-muted-foreground flex items-center gap-1.5">
              <RefreshCw className="w-3 h-3" /> Last synced {new Date(account.synced_date).toLocaleString()}
            </div>
          )}
          {connected && autoSyncLabel && (
            <label className="mt-3 flex items-center gap-2.5 cursor-pointer">
              <Switch checked={account.auto_sync} onCheckedChange={toggleSync} disabled={busy === 'settings'} />
              <span className="text-sm">{autoSyncLabel}</span>
            </label>
          )}
          {error && <p role="alert" className="mt-3 text-xs text-destructive">{error}</p>}
        </div>
      </div>
      <div className="px-5 pb-5 flex flex-wrap gap-2">
        {connected ? (
          <>
            <GlassButton size="sm" type="button" onClick={sync} disabled={busy === 'sync'}>
              {busy === 'sync' ? <Loader2 className="w-4 h-4 animate-spin" /> : <RefreshCw className="w-4 h-4" />} Sync now
            </GlassButton>
            <GlassButton size="sm" type="button" variant="ghost" onClick={disconnect} disabled={busy === 'disconnect'}>
              {busy === 'disconnect' ? <Loader2 className="w-4 h-4 animate-spin" /> : <Unplug className="w-4 h-4" />} Disconnect
            </GlassButton>
          </>
        ) : available || reconnect ? (
          <GlassButton size="sm" type="button" variant="primary" onClick={connect} disabled={busy === 'connect'}>
            {busy === 'connect' ? <Loader2 className="w-4 h-4 animate-spin" /> : <CalendarCheck className="w-4 h-4" />}
            {reconnect ? 'Reconnect' : 'Connect'}
          </GlassButton>
        ) : available === false ? (
          <ComingSoonButton label={title} />
        ) : null}
      </div>
    </GlassCard>
  );
}

function StatusBadge({ connected }) {
  return connected ? (
    <span className="inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full text-xs font-semibold bg-secondary text-success">
      <CheckCircle2 className="w-3 h-3" /> Connected
    </span>
  ) : (
    <span className="inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full text-xs font-semibold bg-secondary text-muted-foreground">
      <AlertCircle className="w-3 h-3" /> Not connected
    </span>
  );
}

function ReconnectBadge() {
  return (
    <span className="inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full text-xs font-semibold bg-secondary text-warning">
      <AlertCircle className="w-3 h-3" /> Reconnect needed
    </span>
  );
}

function ComingSoonBadge() {
  return (
    <span className="inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full text-xs font-semibold bg-primary-soft text-link">
      <Clock className="w-3 h-3" /> Coming soon
    </span>
  );
}

// Connecting isn't available yet; the button stays visible so hosts know it's planned.
function ComingSoonButton({ label }) {
  return (
    <GlassButton size="sm" type="button" disabled aria-label={`${label} connection coming soon`} className="disabled:opacity-100 border-dashed text-muted-foreground">
      <Clock className="w-4 h-4" /> Coming soon
    </GlassButton>
  );
}

function GoogleSetupModal({ calendars, selectedCalendarId, saving, onClose, onSave }) {
  const [selected, setSelected] = useState(selectedCalendarId);

  return (
    <Dialog open onOpenChange={(next) => { if (!next) onClose(); }}>
      <DialogContent showCloseButton={false} aria-describedby={undefined} className="sm:max-w-md p-6 block">
        <div className="flex items-center gap-3 mb-4">
          <div className="w-10 h-10 rounded-lg border border-border bg-white flex items-center justify-center"><GoogleG /></div>
          <div>
            <DialogTitle>Google Calendar</DialogTitle>
            <p className="text-xs text-muted-foreground">Where new bookings go</p>
          </div>
        </div>

        <p className="text-sm text-muted-foreground mb-3">Choose the calendar where GlassMeet adds confirmed bookings. Busy times are checked in this calendar and your primary one.</p>
        {!calendars ? (
          <div className="mb-5 flex items-center gap-2 text-sm text-muted-foreground"><Loader2 className="w-4 h-4 animate-spin" /> Loading your calendars…</div>
        ) : !calendars.length ? (
          <p className="mb-5 text-sm text-muted-foreground">No calendars you can add events to were found.</p>
        ) : (
          <div className="space-y-2 mb-5 max-h-[50vh] overflow-y-auto">
            {calendars.map((calendar) => (
              <label key={calendar.id} className={`flex items-center gap-3 p-3 rounded-lg border cursor-pointer transition-all duration-200 ${selected === calendar.id ? 'border-primary bg-primary-soft' : 'border-border hover:border-border-hover'}`}>
                <input type="radio" name="google-calendar" checked={selected === calendar.id} onChange={() => setSelected(calendar.id)} className="accent-primary" />
                <Calendar className="w-4 h-4 text-muted-foreground" />
                <span className="text-sm">{calendar.summary}{calendar.primary ? ' (primary)' : ''}</span>
              </label>
            ))}
          </div>
        )}
        <div className="flex gap-2 justify-end">
          <GlassButton size="sm" type="button" variant="ghost" onClick={onClose}>Cancel</GlassButton>
          <GlassButton size="sm" type="button" variant="primary" onClick={() => onSave(selected)} disabled={!selected || !calendars || saving}>
            {saving && <Loader2 className="w-4 h-4 animate-spin" />} Save
          </GlassButton>
        </div>
      </DialogContent>
    </Dialog>
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

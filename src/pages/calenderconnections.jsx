import React, { useState, useEffect } from 'react';
import {
  Calendar, CalendarCheck, RefreshCw, Unplug, CheckCircle2,
  Apple, AlertCircle, Loader2, Settings2,
  Rss, Copy, RotateCcw, Clock,
} from 'lucide-react';
import { GlassCard, GlassButton, GlassInput, PageHeader } from '@/components/glass';
import { Switch } from '@/components/ui/switch';
import { api } from '@/lib/localApi';
import { useApp } from '@/lib/useprofile.js';
import { downloadIcs } from '@/lib/calendar';
import { downloadICSFeed } from '@/lib/calendarFeed';
import OutlookIcon from '@/components/outlookicon.jsx';
import { getCalendarPriority } from '@/lib/devicedetect.js';
import { Dialog, DialogContent, DialogTitle } from '@/components/ui/dialog';
import { Checkbox } from '@/components/ui/checkbox';

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
  const [feedToken, setFeedToken] = useState('');
  const [feedState, setFeedState] = useState('loading');
  const [feedError, setFeedError] = useState('');
  const [copiedFeed, setCopiedFeed] = useState(false);
  const [feedResetting, setFeedResetting] = useState(false);

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
      const all = await api.entities.Booking.filter({ host_id: profile.id }, 'start_time', 500);
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
        setFeedError(/cal_feeds|relation|schema cache/i.test(error.message)
          ? 'Calendar subscriptions are not set up on the server yet.'
          : `Could not load your subscription link: ${error.message}`);
        setFeedState('error');
      });
  }, []);

  const copyFeedUrl = () => {
    navigator.clipboard.writeText(feedUrl);
    setCopiedFeed(true);
    setTimeout(() => setCopiedFeed(false), 2000);
  };

  const resetFeed = async () => {
    if (!confirm('Reset your subscription link? Calendars using the current link will stop updating until you subscribe again with the new one.')) return;
    setFeedResetting(true);
    try {
      setFeedToken(await api.calendarFeed.rotate());
    } catch (error) {
      setFeedError(`Could not reset the link: ${error.message}`);
      setFeedState('error');
    }
    setFeedResetting(false);
  };

  return (
    <div className="space-y-6 animate-fade-in">
      <PageHeader title="Calendars" description="Keep your meetings in the calendar you already use. Google and Outlook account connections are coming soon." />

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
                  <GlassInput value={feedUrl} readOnly onFocus={(e) => e.target.select()} aria-label="Calendar subscription link" className="flex-1 font-mono text-xs" />
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
            <a href={feedUrl.replace(/^https:/, 'webcal:')}>
              <GlassButton size="sm" variant="primary" type="button"><Apple className="w-4 h-4" /> Apple Calendar</GlassButton>
            </a>
            <a href={`https://calendar.google.com/calendar/r?cid=${encodeURIComponent(feedUrl.replace(/^https:/, 'webcal:'))}`} target="_blank" rel="noreferrer">
              <GlassButton size="sm" type="button"><Calendar className="w-4 h-4" /> Google Calendar</GlassButton>
            </a>
            <a href={`https://outlook.live.com/calendar/0/addfromweb?url=${encodeURIComponent(feedUrl)}&name=${encodeURIComponent('GlassMeet')}`} target="_blank" rel="noreferrer">
              <GlassButton size="sm" type="button"><OutlookIcon className="w-4 h-4" /> Outlook</GlassButton>
            </a>
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
              {googleConnected ? <StatusBadge connected /> : <ComingSoonBadge />}
            </div>
            <p className="text-sm text-muted-foreground mt-1">
              {googleConnected
                ? 'Connected. Availability is checked against your Google Calendar before booking slots are shown.'
                : 'Soon you can connect Google Calendar so busy times stay off your booking page and new bookings are added to it. Until then, guests can add meetings to Google Calendar from their confirmation page.'}
            </p>

            {googleConnected && (
              <div className="mt-4 space-y-3">
                <div className="flex flex-wrap gap-2">
                  {selectedCalendars.length ? selectedCalendars.map((c) => (
                    <span key={c} className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-semibold bg-secondary">
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
                  <p className="text-xs text-success flex items-center gap-1.5">
                    <CheckCircle2 className="w-3 h-3" /> Connection verified — token is valid.
                  </p>
                )}
                {googleError && <p className="text-xs text-destructive">{googleError}</p>}
                <label className="flex items-center gap-2.5 cursor-pointer pt-1">
                  <Switch checked={autoSync} onCheckedChange={toggleAutoSync} />
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
            <ComingSoonButton label="Google Calendar" />
          )}
        </div>
      </GlassCard>

      {/* Apple Calendar */}
      <GlassCard hover={false} className="p-0 overflow-hidden">
        <div className="p-5 flex items-start gap-4">
          <div className="w-11 h-11 rounded-lg bg-black border border-border flex items-center justify-center shrink-0">
            <Apple className="w-6 h-6 text-white" />
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
            {testing === 'apple' ? <Loader2 className="w-4 h-4 animate-spin" /> : <Apple className="w-4 h-4" />}
            Add my meetings
          </GlassButton>
          <GlassButton size="sm" variant="ghost" type="button" onClick={testAppleCalendar} disabled={!!testing}>
            {testing === 'apple-test' ? <Loader2 className="w-4 h-4 animate-spin" /> : <CalendarCheck className="w-4 h-4" />} Download test event
          </GlassButton>
        </div>
      </GlassCard>

      {/* Microsoft Outlook */}
      <GlassCard hover={false} className="p-0 overflow-hidden">
        <div className="p-5 flex items-start gap-4">
          <div className="w-11 h-11 rounded-lg bg-[#0078D4] shadow-xs flex items-center justify-center shrink-0">
            <OutlookIcon className="w-6 h-6" />
          </div>
          <div className="flex-1 min-w-0">
            <div className="flex items-center gap-2 flex-wrap">
              <h2 className="text-[17px] font-bold">Microsoft Outlook</h2>
              {outlookConnected ? <StatusBadge connected /> : <ComingSoonBadge />}
            </div>
            <p className="text-sm text-muted-foreground mt-1">
              {outlookConnected
                ? `Connected to ${outlookEmail}. Availability is checked against your Outlook calendar before booking slots are shown.`
                : 'Soon you can connect a Microsoft 365 or Outlook.com account to check availability and sync meetings. Until then, guests can add meetings to Outlook from their confirmation page.'}
            </p>

            {outlookConnected && (
              <div className="mt-4 space-y-3">
                <div className="text-sm space-y-1">
                  <div className="flex items-center gap-2 text-muted-foreground"><span className="text-xs font-medium">Account</span> {outlookEmail}</div>
                  <div className="flex items-center gap-2 text-muted-foreground"><span className="text-xs font-medium">Type</span> {outlookAccountType === 'microsoft_365' ? 'Microsoft 365 (Work/School)' : 'Personal (Outlook.com)'}</div>
                </div>
                <div className="flex flex-wrap gap-2">
                  {outlookCalendars.length ? outlookCalendars.map((c) => (
                    <span key={c} className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-semibold bg-secondary">
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
                  <Switch checked={outlookAutoSync} onCheckedChange={toggleOutlookAutoSync} />
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
            <ComingSoonButton label="Microsoft Outlook" />
          )}
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
    <span className="inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full text-xs font-semibold bg-secondary text-success">
      <CheckCircle2 className="w-3 h-3" /> Connected
    </span>
  ) : (
    <span className="inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full text-xs font-semibold bg-secondary text-muted-foreground">
      <AlertCircle className="w-3 h-3" /> Not connected
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

function GoogleSetupModal({ connected, calendars, selectedCalendarId, onClose, onSave }) {
  const [selected, setSelected] = useState(selectedCalendarId);

  return (
    <Dialog open onOpenChange={(next) => { if (!next) onClose(); }}>
      <DialogContent showCloseButton={false} aria-describedby={undefined} className="sm:max-w-md p-6 block">
        <div className="flex items-center gap-3 mb-4">
          <div className="w-10 h-10 rounded-lg border border-border bg-white flex items-center justify-center"><GoogleG /></div>
          <div>
            <DialogTitle>Google Calendar</DialogTitle>
            <p className="text-xs text-muted-foreground">{connected ? 'Select calendars to check for conflicts' : 'OAuth authorization required'}</p>
          </div>
        </div>

        {connected ? (
          <>
            <p className="text-sm text-muted-foreground mb-3">Choose the calendar where GlassMeet should create confirmed bookings.</p>
            <div className="space-y-2 mb-5">
              {calendars.map((calendar) => (
                <label key={calendar.id} className="flex items-center gap-3 p-3 rounded-lg border border-border cursor-pointer transition-all duration-200 hover:border-border-hover">
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
            <div className="rounded-lg bg-secondary p-4 mb-4 flex gap-3">
              <AlertCircle className="w-5 h-5 text-warning shrink-0 mt-0.5" />
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

function OutlookSetupModal({ connected, selectedCalendars, accountEmail, accountType, onClose, onSave }) {
  const [selected, setSelected] = useState(selectedCalendars);
  const [acctType, setAcctType] = useState(accountType || 'outlook_com');
  const calendars = ['Calendar', 'Work', 'Personal', 'Family', 'Team'];

  const toggle = (cal) => setSelected((s) => s.includes(cal) ? s.filter((c) => c !== cal) : [...s, cal]);

  return (
    <Dialog open onOpenChange={(next) => { if (!next) onClose(); }}>
      <DialogContent showCloseButton={false} aria-describedby={undefined} className="sm:max-w-md p-6 block">
        <div className="flex items-center gap-3 mb-4">
          <div className="w-10 h-10 rounded-lg bg-[#0078D4] shadow-xs flex items-center justify-center"><OutlookIcon className="w-6 h-6" /></div>
          <div>
            <DialogTitle>Microsoft Outlook</DialogTitle>
            <p className="text-xs text-muted-foreground">{connected ? 'Select calendars to check for conflicts' : 'OAuth authorization required'}</p>
          </div>
        </div>

        {connected ? (
          <>
            {accountEmail && (
              <div className="rounded-lg bg-secondary p-3 mb-3 flex items-center gap-2">
                <CheckCircle2 className="w-4 h-4 text-success shrink-0" />
                <div>
                  <div className="text-sm font-medium">{accountEmail}</div>
                  <div className="text-xs text-muted-foreground">{acctType === 'microsoft_365' ? 'Microsoft 365 (Work/School)' : 'Personal (Outlook.com)'}</div>
                </div>
              </div>
            )}
            <p className="text-sm text-muted-foreground mb-3">Choose which Outlook calendars GlassMeet checks when showing available slots.</p>
            <div className="space-y-2 mb-5">
              {calendars.map((cal) => (
                <label key={cal} className="flex items-center gap-3 p-3 rounded-lg border border-border cursor-pointer transition-all duration-200 hover:border-border-hover">
                  <Checkbox checked={selected.includes(cal)} onCheckedChange={() => toggle(cal)} />
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
            <div className="rounded-lg bg-secondary p-4 mb-4 flex gap-3">
              <AlertCircle className="w-5 h-5 text-warning shrink-0 mt-0.5" />
              <div className="text-sm space-y-2">
                <p className="font-medium">Microsoft Outlook two-way sync requires OAuth setup.</p>
                <p className="text-muted-foreground text-xs">
                  Connecting your Microsoft account uses secure OAuth 2.0 with Microsoft Graph API
                  (scopes: <code>Calendars.Read</code>, <code>Calendars.ReadWrite</code>).
                  This requires a Builder+ plan and a Microsoft OAuth client configured in your workspace.
                </p>
              </div>
            </div>
            <div className="rounded-lg bg-secondary p-3 mb-4">
              <p className="text-xs font-medium mb-2">Account type</p>
              <div className="flex gap-2">
                <button onClick={() => setAcctType('microsoft_365')} className={`flex-1 rounded-lg border px-3 py-2.5 text-sm font-semibold transition-all duration-200 ${acctType === 'microsoft_365' ? 'border-primary bg-primary-soft text-link' : 'border-border hover:border-border-hover'}`}>
                  Microsoft 365<br /><span className="text-xs text-muted-foreground">Work / School</span>
                </button>
                <button onClick={() => setAcctType('outlook_com')} className={`flex-1 rounded-lg border px-3 py-2.5 text-sm font-semibold transition-all duration-200 ${acctType === 'outlook_com' ? 'border-primary bg-primary-soft text-link' : 'border-border hover:border-border-hover'}`}>
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
      </DialogContent>
    </Dialog>
  );
}
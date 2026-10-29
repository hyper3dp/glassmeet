import { supabase, supabaseUrl } from '@/lib/supabaseClient';
import { appPath } from '@/lib/authReturnTo';

const TOKEN_KEY = 'glassmeet_session';

// crypto.randomUUID is missing on iOS Safari before 15.4; fall back to getRandomValues
const uuid = () => (crypto.randomUUID ? crypto.randomUUID() : '10000000-1000-4000-8000-100000000000'.replace(/[018]/g, (c) =>
  (c ^ (crypto.getRandomValues(new Uint8Array(1))[0] & (15 >> (c / 4)))).toString(16)));

async function getProfile(userId) {
  const { data, error } = await supabase
    .from('profiles')
    .select('*')
    .eq('id', userId)
    .maybeSingle();
  if (error) throw new Error(error.message);
  return data;
}

// A write that names a column the database doesn't have yet (a migration not applied) fails with
// PGRST204. Drop that column and retry so the rest still saves instead of the whole form failing.
async function writeSkippingMissingColumns(run, value) {
  let row = { ...value };
  for (;;) {
    const result = await run(row);
    const column = result.error?.code === 'PGRST204' && /'([^']+)' column/.exec(result.error.message)?.[1];
    if (!column || !(column in row)) return result;
    console.warn(`GlassMeet: column "${column}" is missing in the database; saved without it.`);
    const { [column]: _skipped, ...rest } = row;
    row = rest;
  }
}

const notDeployed = (error) => error && (error.code === 'PGRST202' || error.code === '42883' || /could not find the function|does not exist/i.test(error.message || ''));

let googleBusyMissing = false; // the google-calendar edge function isn't there (see google.busy)

const googleError = (code, message) => Object.assign(new Error(message), { code });
// Calls the google-calendar edge function; a failure throws an Error with the function's `code`.
// A function that isn't deployed (or can't be reached) is code 'unavailable'.
async function invokeGoogle(body) {
  const { data, error } = await supabase.functions.invoke('google-calendar', { body });
  if (!error) return data;
  const response = error.context;
  if (error.name === 'FunctionsFetchError' || error.name === 'FunctionsRelayError' || response?.status === 404) {
    throw googleError('unavailable', 'Google Calendar isn’t available yet.');
  }
  const detail = typeof response?.json === 'function' ? await response.json().catch(() => null) : null;
  throw googleError(detail?.error || 'error', detail?.message || error.message || 'Google Calendar didn’t respond.');
}
let meCache = null;
const sessionUser = async () => (await supabase.auth.getSession()).data.session?.user || null;
// SIGNED_IN also fires when a tab regains focus; the cache is keyed by user id, so another user
// signing in misses it anyway, and only signing out (or a changed login) needs to clear it
supabase.auth.onAuthStateChange((event) => { if (event === 'SIGNED_OUT' || event === 'USER_UPDATED') meCache = null; });

const entities = new Proxy({}, {
  get: (_target, entityName) => {
    const tableMap = {
      EventType: 'event_types',
      Booking: 'bookings',
      BookedSlot: 'busy_slots', // read-only view: times and status, no guest details (public booking pages)
      AvailabilityRule: 'availability_rules',
      AvailabilityException: 'availability_exceptions',
      WhatsAppSetting: 'whatsapp_settings',
      Notification: 'notifications',
      Address: 'addresses',
      EventTemplate: 'event_templates',
    };
    const table = tableMap[entityName] || entityName;

    // Busy times come from the busy_times() function: one host, a date range, times only.
    // Until that migration is applied, fall back to the older busy_slots view.
    if (entityName === 'BookedSlot') {
      return {
        filter: async ({ host_id: host, status } = {}) => {
          const from = new Date(Date.now() - 86400000).toISOString();
          const to = new Date(Date.now() + 800 * 86400000).toISOString();
          const { data, error } = await supabase.rpc('busy_times', { p_host: host, p_from: from, p_to: to });
          if (!error) return status ? data.filter((b) => b.status === status) : data;
          const fallback = await supabase.from('busy_slots').select('*').eq('host_id', host).gte('end_time', from);
          if (fallback.error) throw new Error(fallback.error.message);
          return status ? fallback.data.filter((b) => b.status === status) : fallback.data;
        },
      };
    }

    return {
      // columns: a select list ('id, start_time, ...') when a page needs only a few fields
      filter: async (where = {}, sort, limit, columns = '*') => {
        let query = supabase.from(table).select(columns);
        
        // Simple filter mapping: a value matches exactly, an array is "one of", and
        // { gte: x } is "x or later"
        Object.entries(where).forEach(([key, value]) => {
          if (Array.isArray(value)) {
            query = query.in(key, value);
          } else if (value && typeof value === 'object' && 'gte' in value) {
            query = query.gte(key, value.gte);
          } else {
            query = query.eq(key, value);
          }
        });

        if (sort) {
          const isDescending = sort.startsWith('-');
          const field = isDescending ? sort.slice(1) : sort;
          query = query.order(field, { ascending: !isDescending });
        }
        if (limit != null) query = query.limit(limit);

        const { data, error } = await query;
        if (error) throw new Error(error.message);
        return data;
      },
      get: async (id) => {
        const { data, error } = await supabase.from(table).select('*').eq('id', id).single();
        if (error) throw new Error(error.message);
        return data;
      },
      create: async (value) => {
        const { data, error } = await writeSkippingMissingColumns((row) => supabase.from(table).insert([row]).select().single(), value);
        if (error) throw new Error(error.message);
        return data;
      },
      bulkCreate: async (values) => {
        const { data, error } = await supabase.from(table).insert(values).select();
        if (error) throw new Error(error.message);
        return data;
      },
      update: async (id, value) => {
        // a row deleted in the meantime updates nothing; that's not an error
        const { data, error } = await writeSkippingMissingColumns((row) => supabase.from(table).update(row).eq('id', id).select(), value);
        if (error) throw new Error(error.message);
        return data?.[0] ?? null;
      },
      bulkUpdate: async (values) => {
        // Supabase can't give each id its own values in one call, so rows that get the same
        // change (e.g. "mark all read") share one update, and the groups run side by side
        const groups = new Map();
        for (const { id, value, ...fields } of values) {
          const change = value || fields;
          const key = JSON.stringify(change);
          if (!groups.has(key)) groups.set(key, { change, ids: [] });
          groups.get(key).ids.push(id);
        }
        const results = await Promise.all([...groups.values()].map(async ({ change, ids }) => {
          const { data, error } = await supabase.from(table).update(change).in('id', ids).select();
          if (error) throw new Error(error.message);
          return data;
        }));
        return results.flat();
      },
      delete: async (id) => {
        const { error } = await supabase.from(table).delete().eq('id', id);
        if (error) throw new Error(error.message);
        return { success: true };
      },
    };
  },
});

export const api = {
  entities,
  app: { 
    getPublicSettings: async () => ({ id: 'supabase', public_settings: { app_name: 'GlassMeet (Cloud)' } }) 
  },
  auth: {
    // The local session is enough to know who is signed in (the server re-checks the token on
    // every query through RLS), and concurrent callers share one profile request.
    me: async () => {
      const user = await sessionUser();
      if (!user) throw new Error('Not authenticated');
      if (meCache?.id === user.id) return meCache.promise;
      const promise = (async () => {
        // Try fetching the profile, or auto-create it if missing to prevent login loops
        const profile = await getProfile(user.id);
        // older profiles were created without a name; show the Google name or email instead of "?"
        if (profile) return { ...profile, full_name: profile.full_name || user.user_metadata?.full_name || user.user_metadata?.name || user.email?.split('@')[0] || '' };
        const { data: newProfile, error: createError } = await supabase
          .from('profiles')
          .insert([{
            id: user.id,
            email: user.email,
            full_name: user.user_metadata?.full_name || user.email?.split('@')[0] || ''
          }])
          .select()
          .single();
        // another tab (or the sign-up trigger) made it first: read that one
        if (createError?.code === '23505') {
          const existing = await getProfile(user.id);
          if (existing) return existing;
        }
        if (createError) throw new Error(createError.message);
        return newProfile;
      })();
      meCache = { id: user.id, promise };
      promise.catch(() => { meCache = null; });
      return promise;
    },
    updateMe: async (value) => {
      const user = await sessionUser();
      const { data, error } = await writeSkippingMissingColumns((row) => supabase.from('profiles').update(row).eq('id', user.id).select().single(), value);
      if (error) throw new Error(error.message);
      meCache = { id: user.id, promise: Promise.resolve(data) };
      return data;
    },
    // First-run working hours: flips profiles.hours_seeded from false to true and says whether
    // this call did it, so only one tab (or effect run) ever seeds the default hours.
    claimHoursSeeding: async () => {
      const user = await sessionUser();
      const { data, error } = await supabase.from('profiles').update({ hours_seeded: true })
        .eq('id', user.id).eq('hours_seeded', false).select();
      if (error) throw new Error(error.message);
      meCache = null;
      return data.length > 0;
    },
    loginViaEmailPassword: async (email, password) => {
      const { data, error } = await supabase.auth.signInWithPassword({ email, password });
      if (error) {
        const err = new Error(error.code === 'email_not_confirmed' ? 'Confirm your email before logging in. Check your inbox (and spam) for the link.' : error.message);
        err.code = error.code;
        throw err;
      }
      return { user: await getProfile(data.user.id), access_token: data.session.access_token };
    },
    register: async (value) => {
      // The confirmation link returns to the page the user was heading for (the app root by
      // default, a page GitHub Pages always serves), which signs them in from the link.
      const { data, error } = await supabase.auth.signUp({
        email: value.email,
        password: value.password,
        options: { emailRedirectTo: `${window.location.origin}${appPath(value.returnTo || '/')}`, data: value.full_name ? { full_name: value.full_name } : undefined },
      });
      // with confirmations off, Supabase reports an existing account as an error instead
      if (error?.code === 'user_already_exists') {
        const err = new Error('An account with this email already exists. Log in or reset your password.');
        err.code = 'user_exists';
        throw err;
      }
      if (error) throw new Error(error.message);
      // with confirmations on, an address that already has an account comes back with no
      // identities and no error, and no email is sent
      if (data.user && data.user.identities?.length === 0) {
        const err = new Error('An account with this email already exists. Log in or reset your password.');
        err.code = 'user_exists';
        throw err;
      }
      if (!data.session) return { user: null, access_token: undefined };
      return { user: await getProfile(data.user.id), access_token: data.session.access_token };
    },
    resendSignup: async (email, returnTo = '/') => {
      const { error } = await supabase.auth.resend({
        type: 'signup',
        email,
        options: { emailRedirectTo: `${window.location.origin}${appPath(returnTo)}` },
      });
      if (error) throw new Error(error.message);
    },
    // LinkedIn's "Sign In with LinkedIn using OpenID Connect" provider in Supabase
    loginWithLinkedIn: async (returnTo = '/') => {
      const { data, error } = await supabase.auth.signInWithOAuth({
        provider: 'linkedin_oidc',
        options: { redirectTo: `${window.location.origin}${appPath(returnTo)}` }
      });
      if (error) throw new Error(error.message);
      if (data?.url) window.location.assign(data.url);
    },
    loginWithGoogle: async (returnTo = '/') => {
      const { data, error } = await supabase.auth.signInWithOAuth({
        provider: 'google',
        options: { redirectTo: `${window.location.origin}${appPath(returnTo)}` }
      });
      if (error) throw new Error(error.message);
      if (data?.url) window.location.assign(data.url);
    },
    verifyOtp: async ({ email, token }) => {
      const { data, error } = await supabase.auth.verifyOtp({
        email,
        token,
        type: 'signup',
      });
      if (error) throw new Error(error.message);
      return { user: await getProfile(data.user.id), session: data.session };
    },
    logout: async () => {
      // signOut reports a failure (e.g. offline) instead of throwing; then at least end the
      // session on this device, so the login page doesn't find it still signed in
      const { error } = await supabase.auth.signOut();
      if (error) await supabase.auth.signOut({ scope: 'local' });
    },
    // Deletes the signed-in account and all its data: profile photos first (Storage doesn't
    // cascade), then the login, which takes every table with it (see delete_my_account()).
    deleteAccount: async () => {
      const user = await sessionUser();
      if (!user) throw new Error('Sign in first.');
      const bucket = supabase.storage.from('avatars');
      const { data: files, error: listError } = await bucket.list(user.id, { limit: 1000 });
      if (listError && !/not found/i.test(listError.message)) throw new Error(listError.message);
      if (files?.length) {
        const { error: removeError } = await bucket.remove(files.map((f) => `${user.id}/${f.name}`));
        if (removeError) throw new Error(removeError.message);
      }
      const { error } = await supabase.rpc('delete_my_account');
      if (notDeployed(error)) throw new Error('Deleting accounts isn’t available yet. Please try again later.');
      if (error) throw new Error(error.message);
      meCache = null;
      // the session belonged to the deleted login; clear it on this device
      await supabase.auth.signOut({ scope: 'local' }).catch(() => {});
    },
    resetPasswordRequest: async (email) => {
      const { error } = await supabase.auth.resetPasswordForEmail(email, {
        redirectTo: `${window.location.origin}${appPath('/reset-password')}`,
      });
      if (error) throw new Error(error.message);
      return { success: true };
    },
    resetPassword: async (value) => {
      const { error } = await supabase.auth.updateUser({ password: value.newPassword });
      if (error) throw new Error(error.message);
      return { success: true };
    },
    hasSession: async () => {
      const { data: { session } } = await supabase.auth.getSession();
      return Boolean(session);
    },
    // same shape as supabase-js: { data: { subscription } }
    onAuthStateChange: (callback) => supabase.auth.onAuthStateChange((event, session) => callback(event, session)),
  },
  // Google Calendar: the connection row is read directly (RLS: own row only); everything that
  // needs Google goes through the google-calendar edge function. Errors carry a `code`
  // ('not_configured', 'unavailable', 'not_connected', 'reconnect', ...).
  google: {
    status: async () => {
      const user = await sessionUser();
      if (!user) return { connected: false };
      const { data, error } = await supabase.from('google_accounts')
        .select('email, calendar_id, calendar_name, auto_sync, connected, synced_date, connected_date')
        .eq('user_id', user.id).maybeSingle();
      // no table yet (migration not applied) or no row: simply not connected
      if (error || !data) return { connected: false };
      return { ...data, connected: Boolean(data.connected), needsReconnect: !data.connected };
    },
    // starts the OAuth flow: Google's consent page, then back to returnTo
    connect: async (returnTo = '/calendar-connections') => {
      const { url } = await invokeGoogle({ action: 'authUrl', returnTo });
      if (!url) throw googleError('unavailable', 'Google Calendar isn’t available yet.');
      window.location.assign(url);
    },
    // the app's half of the callback: hands Google's code to the function as the signed-in host
    finish: (code, state) => invokeGoogle({ action: 'finish', code, state }),
    calendars: () => invokeGoogle({ action: 'listCalendars' }),
    // Booking pages ask on every month change. Once the function turns out to be missing (not
    // deployed, or unreachable), stop asking for the rest of the session.
    busy: async (hostId, timeMin, timeMax) => {
      if (googleBusyMissing) return [];
      try {
        const data = await invokeGoogle({ action: 'freeBusy', hostId, timeMin, timeMax });
        // in the bookings' shape: generateSlots only counts entries with start_time / end_time
        return Array.isArray(data) ? data.map((x) => ({ start_time: x.start, end_time: x.end })) : [];
      } catch (error) {
        if (error.code === 'unavailable') googleBusyMissing = true;
        throw error;
      }
    },
    // copies a booking to the host's Google Calendar; never fails the caller
    pushBooking: (bookingId) => invokeGoogle({ action: 'pushBooking', bookingId }).catch(() => ({ pushed: false })),
    // { calendarId?, autoSync? } -> { calendarId, calendarName, autoSync }
    saveSettings: (value) => invokeGoogle({ action: 'saveSettings', ...value }),
    sync: () => invokeGoogle({ action: 'sync' }),
    disconnect: () => invokeGoogle({ action: 'disconnect' }),
  },
  // Profile photo: uploads to the public avatars bucket under the user's own folder
  storage: {
    uploadAvatar: async (file) => {
      const user = await sessionUser();
      const ext = (file.name.split('.').pop() || 'jpg').toLowerCase().replace(/[^a-z0-9]/g, '');
      const path = `${user.id}/avatar-${Date.now()}.${ext}`;
      // Each upload gets a new name, so a plain insert is enough. upsert would also need
      // select + update rights on storage.objects, which the avatars policies don't grant.
      const { error } = await supabase.storage.from('avatars').upload(path, file, { contentType: file.type, cacheControl: '31536000' });
      if (error) {
        throw new Error(/bucket not found/i.test(error.message)
          ? 'Photo storage is not set up yet (the "avatars" bucket is missing).'
          : error.message);
      }
      return supabase.storage.from('avatars').getPublicUrl(path).data.publicUrl;
    },
  },
  // Guests can create a booking but not read bookings back (RLS), so the id is made here
  // and the row is inserted without returning it.
  // Public booking pages: an active event's public fields (no meeting link or host email).
  events: {
    getPublic: async (id) => {
      const { data, error } = await supabase.rpc('public_event_type', { p_id: id });
      if (notDeployed(error)) return entities.EventType.get(id);
      if (error) throw new Error(error.message);
      if (!data) throw new Error('This booking page could not be found.');
      return data;
    },
  },
  bookings: {
    createAsGuest: async (value) => {
      const row = { id: uuid(), ...value };
      const { error } = await supabase.from('bookings').insert([row]);
      if (error) throw new Error(error.message);
      return { ...row, created_date: new Date().toISOString() };
    },
    // the meeting link for a booking the guest just made (null while it waits for approval)
    meetingLink: async (id) => {
      const { data, error } = await supabase.rpc('booking_meeting_link', { p_booking: id });
      if (error) return undefined; // older database: the page already has the link
      return data || null;
    },
  },
  // A host's hours for their booking pages (no private labels). Until the migration is applied,
  // read the tables as before.
  availability: {
    forHost: async (hostId) => {
      const { data, error } = await supabase.rpc('host_availability', { p_host: hostId });
      if (notDeployed(error)) {
        const [rules, exceptions] = await Promise.all([
          api.entities.AvailabilityRule.filter({ created_by_id: hostId }),
          api.entities.AvailabilityException.filter({ created_by_id: hostId }),
        ]);
        return { rules, exceptions };
      }
      if (error) throw new Error(error.message);
      return { rules: data?.rules || [], exceptions: data?.exceptions || [] };
    },
  },
  // Public holidays a host blocks (profiles.holidays). Until the migration is applied, none.
  holidays: {
    forRegion: async (region) => {
      if (!region) return [];
      const { data, error } = await supabase.from('holidays').select('date, name').eq('region', region).order('date');
      if (notDeployed(error) || error?.code === 'PGRST205') return [];
      if (error) throw new Error(error.message);
      return data || [];
    },
    // booking pages: the host's holidays, without reading their profile
    forHost: async (hostId) => {
      const { data, error } = await supabase.rpc('host_holidays', { p_host: hostId });
      if (notDeployed(error)) return [];
      if (error) throw new Error(error.message);
      return data || [];
    },
  },
  // Calendar subscription feed: one secret token per host, served as .ics by the calendar-feed edge function
  calendarFeed: {
    urlFor: (token) => `${supabaseUrl}/functions/v1/calendar-feed/${token}.ics`,
    mine: async () => {
      const user = await sessionUser();
      const { data, error } = await supabase.from('cal_feeds').select('token').eq('owner', user.id).maybeSingle();
      if (error) throw new Error(error.message);
      if (data) return data.token;
      const { data: created, error: createError } = await supabase.from('cal_feeds').insert({ owner: user.id }).select('token').single();
      if (createError) throw new Error(createError.message);
      return created.token;
    },
    // New token; calendars subscribed to the old link stop updating
    // the server makes the new token (rotate_cal_feed); older databases took it from here
    rotate: async () => {
      const { data, error } = await supabase.rpc('rotate_cal_feed');
      if (!error) return data;
      if (!notDeployed(error)) throw new Error(error.message);
      const user = await sessionUser();
      const token = Array.from(crypto.getRandomValues(new Uint8Array(24)), (b) => b.toString(16).padStart(2, '0')).join('');
      const fallback = await supabase.from('cal_feeds').update({ token, rotated_at: new Date().toISOString() }).eq('owner', user.id).select('token').single();
      if (fallback.error) throw new Error(fallback.error.message);
      return fallback.data.token;
    },
  },
};
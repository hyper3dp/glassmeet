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
    };
    const table = tableMap[entityName] || entityName;

    return {
      filter: async (where = {}, sort, limit) => {
        let query = supabase.from(table).select('*');
        
        // Simple filter mapping
        Object.entries(where).forEach(([key, value]) => {
          if (Array.isArray(value)) {
            query = query.in(key, value);
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
        const { data, error } = await supabase.from(table).insert([value]).select().single();
        if (error) throw new Error(error.message);
        return data;
      },
      bulkCreate: async (values) => {
        const { data, error } = await supabase.from(table).insert(values).select();
        if (error) throw new Error(error.message);
        return data;
      },
      update: async (id, value) => {
        const { data, error } = await supabase.from(table).update(value).eq('id', id).select().single();
        if (error) throw new Error(error.message);
        return data;
      },
      bulkUpdate: async (values) => {
        // Supabase doesn't support bulk update with different values per ID in one call
        // We map them to individual updates
        const results = [];
        for (const { id, value, ...fields } of values) {
          const { data, error } = await supabase.from(table).update(value || fields).eq('id', id).select().single();
          if (error) throw new Error(error.message);
          results.push(data);
        }
        return results;
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
    me: async () => {
      const { data: { user }, error } = await supabase.auth.getUser();
      if (error || !user) throw new Error('Not authenticated');
      
      // Try fetching the profile, or auto-create it if missing to prevent login loops
      // getProfile uses maybeSingle, so a missing row comes back as null rather than throwing
      const profile = await getProfile(user.id);
      if (profile) return profile;

      const { data: newProfile, error: createError } = await supabase
        .from('profiles')
        .insert([{
          id: user.id,
          email: user.email,
          full_name: user.user_metadata?.full_name || user.email?.split('@')[0] || ''
        }])
        .select()
        .single();

      if (createError) throw new Error(createError.message);
      return newProfile;
    },
    updateMe: async (value) => {
      const { data: { user } } = await supabase.auth.getUser();
      const { data, error } = await supabase.from('profiles').update(value).eq('id', user.id).select().single();
      if (error) throw new Error(error.message);
      return data;
    },
    loginViaEmailPassword: async (email, password) => {
      const { data, error } = await supabase.auth.signInWithPassword({ email, password });
      if (error) throw new Error(error.message);
      return { user: await getProfile(data.user.id), access_token: data.session.access_token };
    },
    register: async (value) => {
      // The confirmation link returns to the app root (a page GitHub Pages always serves), which
      // signs the user in from the link and forwards to the dashboard.
      const { data, error } = await supabase.auth.signUp({
        email: value.email,
        password: value.password,
        options: { emailRedirectTo: `${window.location.origin}${appPath('/')}` },
      });
      if (error) throw new Error(error.message);
      return { user: await getProfile(data.user.id), access_token: data.session?.access_token };
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
      await supabase.auth.signOut();
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
    onAuthStateChange: (callback) => {
      return {
        data: {
          subscription: supabase.auth.onAuthStateChange((event, session) => {
            callback(event, session);
          }),
        },
      };
    },
  },
  google: {
    status: async () => {
      const { data, error } = await supabase.from('google_accounts').select('*').single();
      if (error) return { connected: false };
      return { connected: true, ...data };
    },
    calendars: async () => {
      const { data, error } = await supabase.functions.invoke('google-calendar', {
        body: { action: 'listCalendars' }
      });
      if (error) throw new Error(error.message);
      return data;
    },
    busy: async (hostId, timeMin, timeMax) => {
      const { data, error } = await supabase.functions.invoke('google-calendar', {
        body: { action: 'freeBusy', hostId, timeMin, timeMax }
      });
      if (error) throw new Error(error.message);
      return data;
    },
    saveSettings: async (value) => {
      const { data, error } = await supabase.from('google_accounts').upsert({
        user_id: (await supabase.auth.getUser()).data.user.id,
        ...value
      }).select().single();
      if (error) throw new Error(error.message);
      return data;
    },
    sync: async () => {
      const { data, error } = await supabase.functions.invoke('google-calendar', {
        body: { action: 'sync' }
      });
      if (error) throw new Error(error.message);
      return data;
    },
    disconnect: async () => {
      const { data, error } = await supabase.from('google_accounts').delete().eq('user_id', (await supabase.auth.getUser()).data.user.id);
      if (error) throw new Error(error.message);
      return { success: true };
    },
  },
  // Profile photo: uploads to the public avatars bucket under the user's own folder
  storage: {
    uploadAvatar: async (file) => {
      const { data: { user } } = await supabase.auth.getUser();
      const ext = (file.name.split('.').pop() || 'jpg').toLowerCase().replace(/[^a-z0-9]/g, '');
      const path = `${user.id}/avatar-${Date.now()}.${ext}`;
      const { error } = await supabase.storage.from('avatars').upload(path, file, { upsert: true, contentType: file.type, cacheControl: '3600' });
      if (error) throw new Error(error.message);
      return supabase.storage.from('avatars').getPublicUrl(path).data.publicUrl;
    },
  },
  // Guests can create a booking but not read bookings back (RLS), so the id is made here
  // and the row is inserted without returning it.
  bookings: {
    createAsGuest: async (value) => {
      const row = { id: uuid(), ...value };
      const { error } = await supabase.from('bookings').insert([row]);
      if (error) throw new Error(error.message);
      return { ...row, created_date: new Date().toISOString() };
    },
  },
  // Calendar subscription feed: one secret token per host, served as .ics by the calendar-feed edge function
  calendarFeed: {
    urlFor: (token) => `${supabaseUrl}/functions/v1/calendar-feed/${token}.ics`,
    mine: async () => {
      const { data: { user } } = await supabase.auth.getUser();
      const { data, error } = await supabase.from('cal_feeds').select('token').eq('owner', user.id).maybeSingle();
      if (error) throw new Error(error.message);
      if (data) return data.token;
      const { data: created, error: createError } = await supabase.from('cal_feeds').insert({ owner: user.id }).select('token').single();
      if (createError) throw new Error(createError.message);
      return created.token;
    },
    // New token; calendars subscribed to the old link stop updating
    rotate: async () => {
      const { data: { user } } = await supabase.auth.getUser();
      const token = Array.from(crypto.getRandomValues(new Uint8Array(24)), (b) => b.toString(16).padStart(2, '0')).join('');
      const { data, error } = await supabase.from('cal_feeds').update({ token, rotated_at: new Date().toISOString() }).eq('owner', user.id).select('token').single();
      if (error) throw new Error(error.message);
      return data.token;
    },
  },
};
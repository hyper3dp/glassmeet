import { requireSupabase, supabase } from '@/lib/supabase';

function profileFromUser(user) {
  if (!user) return null;
  return {
    ...user.user_metadata,
    id: user.id,
    email: user.email,
    full_name: user.user_metadata?.full_name || user.email?.split('@')[0] || 'Host',
    created_date: user.created_at,
  };
}

function recordFromRow(row) {
  return {
    ...row.data,
    id: row.id,
    created_date: row.created_at,
    updated_date: row.updated_at,
  };
}

function matchesFilter(record, filter) {
  return Object.entries(filter).every(([key, expected]) => {
    const actual = record[key];
    if (Array.isArray(expected)) return expected.some((value) => String(value) === String(actual));
    return String(actual) === String(expected);
  });
}

async function currentUserId() {
  const client = requireSupabase();
  const { data, error } = await client.auth.getUser();
  if (error?.name === 'AuthSessionMissingError') return null;
  if (error) throw error;
  return data.user?.id ?? null;
}

function cleanData(value) {
  const data = { ...value };
  delete data.id;
  delete data.created_date;
  delete data.updated_date;
  return data;
}

async function createRecord(entityName, value) {
  const client = requireSupabase();
  const data = cleanData(value);
  const userId = await currentUserId();
  if (userId && !data.created_by_id && !data.host_id) data.created_by_id = userId;
  const ownerId = data.created_by_id || data.host_id || userId;
  const { data: row, error } = await client
    .from('app_records')
    .insert({ entity: String(entityName), owner_id: ownerId, data })
    .select('*')
    .single();
  if (error) throw error;
  const record = recordFromRow(row);
  if (String(entityName) === 'Booking' && record.status === 'confirmed' && record.approval_status !== 'pending') {
    invokeGoogle({ action: 'create-booking-event', bookingId: record.id })
      .catch((googleError) => console.error('Google Calendar event creation failed:', googleError));
  }
  return record;
}

const entities = new Proxy({}, {
  get: (_target, entityName) => ({
    filter: async (where = {}, sort, limit) => {
      const client = requireSupabase();
      let query = client.from('app_records').select('*').eq('entity', String(entityName)).limit(1000);
      const { data, error } = await query;
      if (error) throw error;
      let records = data.map(recordFromRow).filter((record) => matchesFilter(record, where));
      if (sort) {
        const descending = sort.startsWith('-');
        const field = descending ? sort.slice(1) : sort;
        records.sort((a, b) => {
          const result = String(a[field] ?? '').localeCompare(String(b[field] ?? ''), undefined, { numeric: true });
          return descending ? -result : result;
        });
      }
      if (limit != null) records = records.slice(0, limit);
      return records;
    },
    get: async (id) => {
      const { data, error } = await requireSupabase()
        .from('app_records').select('*').eq('entity', String(entityName)).eq('id', id).maybeSingle();
      if (error) throw error;
      return data ? recordFromRow(data) : null;
    },
    create: (value) => createRecord(entityName, value),
    bulkCreate: async (values) => Promise.all(values.map((value) => createRecord(entityName, value))),
    update: async (id, value) => {
      const client = requireSupabase();
      const existing = await entities[entityName].get(id);
      if (!existing) throw new Error(`${String(entityName)} record not found`);
      const { data, error } = await client.from('app_records')
        .update({ data: { ...cleanData(existing), ...cleanData(value) }, updated_at: new Date().toISOString() })
        .eq('entity', String(entityName)).eq('id', id).select('*').single();
      if (error) throw error;
      return recordFromRow(data);
    },
    bulkUpdate: async (values) => Promise.all(values.map(({ id, ...value }) => entities[entityName].update(id, value))),
    delete: async (id) => {
      const { error } = await requireSupabase().from('app_records')
        .delete().eq('entity', String(entityName)).eq('id', id);
      if (error) throw error;
      return { success: true };
    },
  }),
});

async function invokeGoogle(body) {
  const { data, error } = await requireSupabase().functions.invoke('google-calendar', { body });
  if (error) throw error;
  return data;
}

const googleScopes = [
  'openid',
  'email',
  'profile',
  'https://www.googleapis.com/auth/calendar.events',
  'https://www.googleapis.com/auth/calendar.calendarlist.readonly',
].join(' ');

export const api = {
  entities,
  app: {
    getPublicSettings: async () => ({ id: 'supabase', public_settings: { app_name: 'GlassMeet' } }),
  },
  auth: {
    me: async () => {
      const { data, error } = await requireSupabase().auth.getUser();
      if (error?.name === 'AuthSessionMissingError') return null;
      if (error) throw error;
      return profileFromUser(data.user);
    },
    updateMe: async (value) => {
      const { data, error } = await requireSupabase().auth.updateUser({ data: value });
      if (error) throw error;
      return profileFromUser(data.user);
    },
    loginViaEmailPassword: async (email, password) => {
      const { data, error } = await requireSupabase().auth.signInWithPassword({ email, password });
      if (error) throw error;
      return { user: profileFromUser(data.user), session: data.session };
    },
    register: async ({ email, password }) => {
      const { data, error } = await requireSupabase().auth.signUp({
        email,
        password,
        options: { data: { full_name: email.split('@')[0] } },
      });
      if (error) throw error;
      return { user: profileFromUser(data.user), session: data.session };
    },
    loginWithGoogle: async (returnTo = '/') => {
      const { data: { user } } = await requireSupabase().auth.getUser();
      const options = {
        redirectTo: new URL(returnTo, window.location.origin).toString(),
        scopes: googleScopes,
        queryParams: { access_type: 'offline', prompt: 'consent' },
      };
      const result = user
        ? await requireSupabase().auth.linkIdentity({ provider: 'google', options })
        : await requireSupabase().auth.signInWithOAuth({ provider: 'google', options });
      if (result.error) throw result.error;
      return result.data;
    },
    logout: async () => {
      const { error } = await requireSupabase().auth.signOut({ scope: 'local' });
      if (error) throw error;
    },
    resetPasswordRequest: async (email) => {
      const { error } = await requireSupabase().auth.resetPasswordForEmail(email, {
        redirectTo: `${window.location.origin}/reset-password`,
      });
      if (error) throw error;
      return { sent: true };
    },
    resetPassword: async ({ newPassword }) => {
      const { data, error } = await requireSupabase().auth.updateUser({ password: newPassword });
      if (error) throw error;
      return { user: profileFromUser(data.user) };
    },
    hasSession: async () => Boolean((await requireSupabase().auth.getSession()).data.session),
    onAuthStateChange: (callback) => supabase
      ? supabase.auth.onAuthStateChange(callback)
      : { data: { subscription: { unsubscribe() {} } } },
  },
  google: {
    status: () => invokeGoogle({ action: 'status' }),
    calendars: () => invokeGoogle({ action: 'calendars' }),
    busy: (hostId, timeMin, timeMax) => invokeGoogle({ action: 'busy', hostId, timeMin, timeMax }),
    saveSettings: (value) => invokeGoogle({ action: 'save-settings', ...value }),
    sync: () => invokeGoogle({ action: 'sync' }),
    disconnect: () => invokeGoogle({ action: 'disconnect' }),
    saveProviderTokens: (refreshToken, email) => invokeGoogle({ action: 'store-token', refreshToken, email }),
  },
};

export function listenForAuthChanges(callback) {
  return requireSupabase().auth.onAuthStateChange(callback);
}

export async function persistGoogleProviderToken(session) {
  if (!session?.provider_refresh_token) return;
  await api.google.saveProviderTokens(session.provider_refresh_token, session.user?.email || '');
}
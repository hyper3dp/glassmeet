import { createClient } from '@supabase/supabase-js';

export const supabaseUrl = import.meta.env.VITE_SUPABASE_URL || '';
export const supabaseAnonKey = import.meta.env.VITE_SUPABASE_ANON_KEY || '';
export const supabaseConfigured = Boolean(supabaseUrl && supabaseAnonKey);

const sessionStorage = {
  getItem: (key) => window.localStorage.getItem(key),
  removeItem: (key) => window.localStorage.removeItem(key),
  setItem: (key, value) => {
    try {
      const session = JSON.parse(value);
      delete session.provider_token;
      delete session.provider_refresh_token;
      window.localStorage.setItem(key, JSON.stringify(session));
    } catch {
      window.localStorage.setItem(key, value);
    }
  },
};

export const supabase = supabaseConfigured
  ? createClient(supabaseUrl, supabaseAnonKey, {
    auth: {
      autoRefreshToken: true,
      detectSessionInUrl: true,
      persistSession: true,
      storage: sessionStorage,
    },
  })
  : null;

export function requireSupabase() {
  if (!supabase) {
    throw new Error('Supabase is not configured. Add the Supabase URL and anon key to the GitHub Pages build settings.');
  }
  return supabase;
}
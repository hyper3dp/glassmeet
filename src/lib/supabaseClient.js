import { createClient } from '@supabase/supabase-js';

export const supabaseUrl = 'https://sjxraemrdpzleipfmwun.supabase.co';
const supabaseAnonKey = 'sb_publishable_0T8UhXmO8GUjyZa67yIU5w_RZwkPa4O';

export const supabase = createClient(supabaseUrl, supabaseAnonKey, {
  auth: {
    persistSession: true,
    autoRefreshToken: true,
    detectSessionInUrl: true,
    storage: window.localStorage,
  },
});
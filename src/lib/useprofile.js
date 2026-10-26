import React, { createContext, useContext, useEffect, useState, useCallback } from 'react';
import { api } from '@/lib/localApi';

export const AppContext = createContext(null);
export const useApp = () => useContext(AppContext);

const DEFAULT_HOURS = [1, 2, 3, 4, 5].map((dow) => ({ day_of_week: dow, start_time: '09:00', end_time: '17:00' }));

// First-run Mon–Fri 9–5 hours, so booking pages work out of the box. Seeded once per host
// (profiles.hours_seeded), so a host who later turns every day off keeps them off. Before that
// column exists (hours_seeded undefined), hosts with no hours at all get the defaults.
// One run per user at a time: StrictMode's double effect and repeat loads share it.
let seeding = null;
const seedHours = (me) => {
  if (me.hours_seeded === true) return Promise.resolve();
  if (seeding?.id === me.id) return seeding.promise;
  const promise = (async () => {
    if (me.hours_seeded === false) {
      // claimed atomically on the server, so a second tab finds it already taken
      if (!(await api.auth.claimHoursSeeding())) return;
      try {
        const rules = await api.entities.AvailabilityRule.filter({ created_by_id: me.id });
        if (rules.length === 0) await api.entities.AvailabilityRule.bulkCreate(DEFAULT_HOURS);
      } catch (e) {
        // let the next load try again
        await api.auth.updateMe({ hours_seeded: false }).catch(() => {});
        throw e;
      }
      return;
    }
    const rules = await api.entities.AvailabilityRule.filter({ created_by_id: me.id });
    if (rules.length === 0) await api.entities.AvailabilityRule.bulkCreate(DEFAULT_HOURS);
  })();
  seeding = { id: me.id, promise };
  promise.catch(() => { if (seeding?.promise === promise) seeding = null; });
  return promise;
};

// Loads and caches the current user's profile data + WhatsApp settings.
export function useProfile() {
  const [user, setUser] = useState(null);
  const [profile, setProfile] = useState(null);
  const [whatsapp, setWhatsapp] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  const load = useCallback(async () => {
    setError(null);
    try {
      const me = await api.auth.me();
      setUser(me);
      setProfile(me);
      // WhatsApp settings and first-run working hours load side by side
      await Promise.all([
        api.entities.WhatsAppSetting.filter({ created_by_id: me.id })
          .then((settings) => setWhatsapp(settings[0] || null))
          .catch(() => setWhatsapp(null)),
        seedHours(me).catch(() => { /* non-fatal */ }),
      ]);
    } catch (e) {
      setUser(null);
      setProfile(null);
      setError(e?.message || 'Your profile could not be loaded.');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { load(); }, [load]);

  const updateProfile = useCallback(async (data) => {
    const updated = await api.auth.updateMe(data);
    setProfile(updated);
    return updated;
  }, []);

  return { user, profile, whatsapp, setWhatsapp, loading, error, reload: load, updateProfile };
}

export default useProfile;
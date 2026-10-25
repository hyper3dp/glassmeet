import React, { createContext, useContext, useEffect, useState, useCallback } from 'react';
import { api } from '@/lib/localApi';

export const AppContext = createContext(null);
export const useApp = () => useContext(AppContext);

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
        // ensure default working hours exist so booking pages work out of the box
        api.entities.AvailabilityRule.filter({ created_by_id: me.id })
          .then((rules) => rules.length === 0 && api.entities.AvailabilityRule.bulkCreate(
            [1, 2, 3, 4, 5].map((dow) => ({ day_of_week: dow, start_time: '09:00', end_time: '17:00' }))
          ))
          .catch(() => { /* non-fatal */ }),
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
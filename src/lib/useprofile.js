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

  const load = useCallback(async () => {
    try {
      const me = await api.auth.me();
      setUser(me);
      setProfile(me);
      // load whatsapp settings for this user
      try {
        const settings = await api.entities.WhatsAppSetting.filter({ created_by_id: me.id });
        setWhatsapp(settings[0] || null);
      } catch {
        setWhatsapp(null);
      }
      // ensure default working hours exist so booking pages work out of the box
      try {
        const rules = await api.entities.AvailabilityRule.filter({ created_by_id: me.id });
        if (rules.length === 0) {
          await api.entities.AvailabilityRule.bulkCreate(
            [1, 2, 3, 4, 5].map((dow) => ({ day_of_week: dow, start_time: '09:00', end_time: '17:00' }))
          );
        }
      } catch { /* non-fatal */ }
    } catch (e) {
      setUser(null);
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

  return { user, profile, whatsapp, setWhatsapp, loading, reload: load, updateProfile };
}

export default useProfile;
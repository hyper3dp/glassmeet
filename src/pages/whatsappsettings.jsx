import React, { useEffect, useRef, useState } from 'react';
import { api } from '@/lib/localApi';
import { MessageCircle, Info } from 'lucide-react';
import { GlassCard, GlassInput, GlassTextarea, GlassLabel, GlassSelect, Spinner, PageHeader, SaveStatus } from '@/components/glass';
import { useAutosave } from '@/lib/useAutosave';
import {
  DEFAULT_CONFIRMATION_TEMPLATE, DEFAULT_REMINDER_24H, DEFAULT_REMINDER_1H,
} from '@/lib/whatsapp';

export default function WhatsAppSettings({ profile, whatsapp, setWhatsapp }) {
  const [form, setForm] = useState(null);
  const idRef = useRef(whatsapp?.id || null);

  // Load once; later updates to `whatsapp` come from our own saves and must not reset typing
  useEffect(() => {
    if (form) return;
    if (whatsapp) {
      setForm({
        phone_number: whatsapp.phone_number || profile?.whatsapp_number || '',
        enabled: whatsapp.enabled ?? true,
        confirmation_template: whatsapp.confirmation_template || DEFAULT_CONFIRMATION_TEMPLATE,
        reminder_24h_template: whatsapp.reminder_24h_template || DEFAULT_REMINDER_24H,
        reminder_1h_template: whatsapp.reminder_1h_template || DEFAULT_REMINDER_1H,
        auto_send_confirmation: whatsapp.auto_send_confirmation ?? false,
        provider: whatsapp.provider || 'deep_link',
      });
    } else {
      setForm({
        phone_number: profile?.whatsapp_number || '',
        enabled: true,
        confirmation_template: DEFAULT_CONFIRMATION_TEMPLATE,
        reminder_24h_template: DEFAULT_REMINDER_24H,
        reminder_1h_template: DEFAULT_REMINDER_1H,
        auto_send_confirmation: false,
        provider: 'deep_link',
      });
    }
  }, [whatsapp, profile]);

  const creating = useRef(null); // the first save's create, so a second save waits for it
  const autosave = useAutosave(form, async (payload) => {
    if (!idRef.current && creating.current) await creating.current;
    if (idRef.current) {
      const updated = await api.entities.WhatsAppSetting.update(idRef.current, payload);
      if (updated) setWhatsapp(updated);
    } else {
      creating.current = api.entities.WhatsAppSetting.create(payload);
      try {
        const created = await creating.current;
        idRef.current = created.id;
        setWhatsapp(created);
      } finally {
        creating.current = null;
      }
    }
  }, { enabled: !!form, delay: 900 });

  if (!form) return <div className="flex justify-center py-24"><Spinner /></div>;

  const set = (k, v) => setForm((f) => ({ ...f, [k]: v }));

  return (
    <div className="space-y-6 animate-fade-in max-w-3xl">
      <PageHeader title="WhatsApp" description="How GlassMeet prepares confirmations for your guests. Changes save automatically." actions={<SaveStatus state={autosave.state} error={autosave.error} onRetry={autosave.retry} />} />

      <GlassCard hover={false}>
        <div className="flex items-center gap-3 mb-5">
          <div className="w-11 h-11 rounded-full bg-[#25D366] text-white flex items-center justify-center"><MessageCircle className="w-5 h-5" /></div>
          <div>
            <h2 className="text-lg font-bold">Connection</h2>
            <p className="text-sm text-muted-foreground">Your WhatsApp number and messaging mode.</p>
          </div>
        </div>
        <div className="space-y-5">
          <div>
            <GlassLabel htmlFor="wa-phone">WhatsApp phone number</GlassLabel>
            <GlassInput id="wa-phone" type="tel" value={form.phone_number} onChange={(e)=>set('phone_number', e.target.value)} placeholder="+971 50 123 4567" />
          </div>
          <div>
            <GlassLabel htmlFor="wa-mode">Messaging mode</GlassLabel>
            <GlassSelect id="wa-mode" value={form.provider} onChange={(e)=>set('provider', e.target.value)}>
              <option value="deep_link">Deep link (wa.me)</option>
              <option value="business_api">Business API (not available yet)</option>
            </GlassSelect>
            <p className="mt-2 text-sm text-muted-foreground">
              {form.provider === 'business_api' ? 'Automatic sending through the WhatsApp Business API is not available yet.' : 'Opens WhatsApp with the message filled in; you press send.'}
            </p>
          </div>
        </div>
      </GlassCard>

      <GlassCard hover={false}>
        <h2 className="text-lg font-bold mb-1">Message templates</h2>
        <p className="text-sm text-muted-foreground">GlassMeet fills these in and opens WhatsApp; you press send. Send any of them from a meeting’s details on the Meetings page.</p>
        <p className="text-sm text-muted-foreground mb-5">Use placeholders: [Name], [Host], [Date], [Time], [Duration], [Meeting Link], [Booking Link], [Timezone]. A line whose placeholder is empty is left out.</p>
        <div className="space-y-5">
          <div>
            <GlassLabel htmlFor="wa-confirm">Confirmation message</GlassLabel>
            <GlassTextarea id="wa-confirm" rows={6} value={form.confirmation_template} onChange={(e)=>set('confirmation_template', e.target.value)} />
          </div>
          <div>
            <GlassLabel htmlFor="wa-r24">Reminder the day before</GlassLabel>
            <GlassTextarea id="wa-r24" rows={4} value={form.reminder_24h_template} onChange={(e)=>set('reminder_24h_template', e.target.value)} />
          </div>
          <div>
            <GlassLabel htmlFor="wa-r1">Reminder an hour before</GlassLabel>
            <GlassTextarea id="wa-r1" rows={4} value={form.reminder_1h_template} onChange={(e)=>set('reminder_1h_template', e.target.value)} />
          </div>
        </div>
      </GlassCard>

      {form.provider === 'business_api' && (
        <GlassCard hover={false} className="border-warning/40 bg-warning/5">
          <div className="flex gap-3">
            <Info className="w-5 h-5 text-warning shrink-0" />
            <div className="text-sm space-y-1">
              <div className="font-bold">WhatsApp Business API credentials</div>
              <p className="text-muted-foreground">Automatic sending needs a WhatsApp Business account from Meta. Until it’s available, deep link mode works with your normal WhatsApp.</p>
            </div>
          </div>
        </GlassCard>
      )}

    </div>
  );
}
import React, { useEffect, useState } from 'react';
import { api } from '@/lib/localApi';
import { MessageCircle, Check, Info } from 'lucide-react';
import { GlassCard, GlassButton, GlassInput, GlassTextarea, GlassLabel, GlassSelect, Spinner, PageHeader } from '@/components/glass';
import {
  DEFAULT_CONFIRMATION_TEMPLATE, DEFAULT_REMINDER_24H, DEFAULT_REMINDER_1H,
} from '@/lib/whatsapp';

export default function WhatsAppSettings({ profile, whatsapp, setWhatsapp }) {
  const [form, setForm] = useState(null);
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);

  useEffect(() => {
    if (whatsapp) {
      setForm({
        id: whatsapp.id,
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

  if (!form) return <div className="flex justify-center py-24"><Spinner /></div>;

  const set = (k, v) => setForm((f) => ({ ...f, [k]: v }));

  const save = async () => {
    setSaving(true);
    try {
      const { id, ...payload } = form;
      if (id) {
        const updated = await api.entities.WhatsAppSetting.update(id, payload);
        setWhatsapp(updated);
      } else {
        const created = await api.entities.WhatsAppSetting.create(payload);
        setWhatsapp(created);
      }
      setSaved(true);
      setTimeout(() => setSaved(false), 2500);
    } catch (e) {
      alert('Could not save: ' + (e.message || ''));
    }
    setSaving(false);
  };

  return (
    <div className="space-y-6 animate-fade-in max-w-3xl">
      <PageHeader title="WhatsApp" description="How GlassMeet prepares confirmations for your guests." className="mb-0" />

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
            <GlassInput id="wa-phone" type="tel" value={form.phone_number} onChange={(e)=>set('phone_number', e.target.value)} placeholder="+1 555 000 0000" />
          </div>
          <div>
            <GlassLabel htmlFor="wa-mode">Messaging mode</GlassLabel>
            <GlassSelect id="wa-mode" value={form.provider} onChange={(e)=>set('provider', e.target.value)}>
              <option value="deep_link">Deep link (wa.me): opens WhatsApp with the message filled in</option>
              <option value="business_api">WhatsApp Business API: automatic sending (not available yet)</option>
            </GlassSelect>
          </div>
          <label className="flex items-center gap-3 cursor-pointer">
            <input type="checkbox" checked={form.enabled} onChange={(e)=>set('enabled', e.target.checked)} className="w-4 h-4" />
            <span className="text-sm font-semibold">Enable WhatsApp messaging for new bookings</span>
          </label>
          <label className="flex items-center gap-3 cursor-pointer">
            <input type="checkbox" checked={form.auto_send_confirmation} onChange={(e)=>set('auto_send_confirmation', e.target.checked)} className="w-4 h-4" />
            <span className="text-sm font-semibold">Auto-open WhatsApp confirmation after each booking</span>
          </label>
        </div>
      </GlassCard>

      <GlassCard hover={false}>
        <h2 className="text-lg font-bold mb-1">Message templates</h2>
        <p className="text-sm text-muted-foreground mb-5">Use placeholders: [Name], [Host], [Date], [Time], [Duration], [Meeting Link], [Timezone].</p>
        <div className="space-y-5">
          <div>
            <GlassLabel>Confirmation message</GlassLabel>
            <GlassTextarea rows={6} value={form.confirmation_template} onChange={(e)=>set('confirmation_template', e.target.value)} />
          </div>
          <div>
            <GlassLabel>24-hour reminder</GlassLabel>
            <GlassTextarea rows={4} value={form.reminder_24h_template} onChange={(e)=>set('reminder_24h_template', e.target.value)} />
          </div>
          <div>
            <GlassLabel>1-hour reminder</GlassLabel>
            <GlassTextarea rows={4} value={form.reminder_1h_template} onChange={(e)=>set('reminder_1h_template', e.target.value)} />
          </div>
        </div>
      </GlassCard>

      {form.provider === 'business_api' && (
        <GlassCard hover={false} className="border-warning/40 bg-warning/5">
          <div className="flex gap-3">
            <Info className="w-5 h-5 text-warning shrink-0" />
            <div className="text-sm space-y-1">
              <div className="font-bold">WhatsApp Business API credentials</div>
              <p className="text-muted-foreground">Production automated sending requires a Meta Business account, a verified phone number ID, and a permanent access token. Store these as environment secrets — never hardcode them. Deep-link mode works without credentials and is recommended to start.</p>
            </div>
          </div>
        </GlassCard>
      )}

      <div className="flex gap-3">
        <GlassButton variant="primary" onClick={save} disabled={saving}>
          {saving ? 'Saving…' : saved ? <><Check className="w-4 h-4" /> Saved</> : 'Save settings'}
        </GlassButton>
      </div>
    </div>
  );
}
import React, { useMemo, useRef, useState } from 'react';
import { X, Check } from 'lucide-react';
import { Dialog, DialogContent, DialogTitle } from '@/components/ui/dialog';
import { Switch } from '@/components/ui/switch';
import { GlassButton, GlassInput, GlassLabel, GlassTextarea } from '@/components/glass';
import { collectDetails, sendBugReport } from '@/lib/bugReport.js';
import { useAuth } from '@/lib/Authcontext.jsx';
import { LIMITS, onlyEmail } from '@/lib/inputRules';

export default function BugReportDialog({ onClose }) {
  const { user } = useAuth();
  const [message, setMessage] = useState('');
  const [email, setEmail] = useState('');
  const [withDetails, setWithDetails] = useState(true);
  const [state, setState] = useState('idle'); // idle | sending | sent
  const [error, setError] = useState('');
  const sending = useRef(false);
  // taken when the form opens: what the page looked like when the problem was noticed
  const details = useMemo(() => collectDetails(), []);

  const submit = async (e) => {
    e.preventDefault();
    if (sending.current || !message.trim()) return;
    sending.current = true;
    setState('sending');
    setError('');
    try {
      await sendBugReport({ message, email: user ? '' : email, details: withDetails ? details : null });
      setState('sent');
    } catch (err) {
      setError(/fetch|network/i.test(err.message || '') ? 'We couldn’t reach GlassMeet. Check your connection and try again.' : err.message);
      setState('idle');
    }
    sending.current = false;
  };

  return (
    <Dialog open onOpenChange={(next) => { if (!next) onClose(); }}>
      <DialogContent showCloseButton={false} aria-describedby={undefined} className="sm:max-w-lg p-6 block">
        <div className="mb-1 flex items-center justify-between gap-3">
          <DialogTitle>{state === 'sent' ? 'Thanks for telling us' : 'Report a bug'}</DialogTitle>
          <button type="button" onClick={onClose} aria-label="Close" className="w-8 h-8 rounded-full flex items-center justify-center text-muted-foreground hover:bg-secondary transition-all duration-200"><X className="w-4 h-4" /></button>
        </div>

        {state === 'sent' ? (
          <>
            <p className="mb-5 text-sm text-muted-foreground">Your report is with the GlassMeet team. We read every one while we’re getting ready for launch.</p>
            <div className="flex justify-end"><GlassButton type="button" variant="primary" onClick={onClose}><Check className="w-4 h-4" /> Done</GlassButton></div>
          </>
        ) : (
          <form onSubmit={submit} className="space-y-4">
            <p className="text-sm text-muted-foreground">Something broken or confusing? Tell us what you were doing and what went wrong.</p>
            <div>
              <GlassLabel htmlFor="bug-message">What happened?</GlassLabel>
              <GlassTextarea id="bug-message" required autoFocus rows={5} maxLength={4000} value={message} onChange={(e) => setMessage(e.target.value)}
                placeholder="I clicked Save on my event type and nothing happened…" />
            </div>
            {!user && (
              <div>
                <GlassLabel htmlFor="bug-email">Email (optional)</GlassLabel>
                <GlassInput id="bug-email" type="email" maxLength={LIMITS.email} autoComplete="email" value={email} onChange={(e) => setEmail(onlyEmail(e.target.value))} placeholder="So we can follow up" />
              </div>
            )}
            <div className="rounded-lg border border-border p-3">
              <div className="flex items-center justify-between gap-3">
                <label htmlFor="bug-details" className="text-sm font-semibold text-foreground">Include technical details</label>
                <Switch id="bug-details" checked={withDetails} onCheckedChange={setWithDetails} />
              </div>
              <p className="mt-1 text-sm text-muted-foreground">The page, your browser and screen, and recent errors. No passwords or sign-in tokens.</p>
              {withDetails && (
                <details className="mt-2">
                  <summary className="cursor-pointer text-sm font-semibold text-link">See what’s included</summary>
                  <pre className="mt-2 max-h-48 overflow-auto rounded-lg bg-secondary p-3 font-mono text-xs leading-relaxed text-foreground whitespace-pre-wrap break-all">{JSON.stringify(details, null, 2)}</pre>
                </details>
              )}
            </div>
            {error && <p role="alert" className="text-sm text-destructive">{error}</p>}
            <div className="grid grid-cols-2 gap-2 sm:flex sm:justify-end">
              <GlassButton type="button" onClick={onClose}>Cancel</GlassButton>
              <GlassButton type="submit" variant="primary" disabled={state === 'sending' || !message.trim()}>
                {state === 'sending' ? 'Sending…' : 'Send report'}
              </GlassButton>
            </div>
          </form>
        )}
      </DialogContent>
    </Dialog>
  );
}

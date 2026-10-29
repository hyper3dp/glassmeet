import React, { useRef, useState } from 'react';
import { Link } from 'react-router-dom';
import { api } from '@/lib/localApi';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Loader2, ArrowLeft, Mail } from 'lucide-react';
import AuthLayout, { CodeInput, CODE_MIN, ResendEmailButton } from '@/components/Authlayout.jsx';
import { appPath, safeReturnTo, authErrorMessage } from '@/lib/authReturnTo';
import { LIMITS, onlyEmail } from '@/lib/inputRules';

// After sign-up (or a log-in with an unconfirmed address): the new account is confirmed with the
// code from the "Confirm your email" message, which also signs them in.
export default function Verify() {
  const [email, setEmail] = useState(() => new URLSearchParams(window.location.search).get('email') || '');
  // the address came with the link: show it rather than ask for it again
  const [knownEmail] = useState(() => Boolean(new URLSearchParams(window.location.search).get('email')));
  const [code, setCode] = useState('');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);
  const busy = useRef(false);

  const handleVerify = async (e) => {
    e.preventDefault();
    if (busy.current) return;
    if (code.length < CODE_MIN) { setError(`Enter the ${CODE_MIN}-digit code from the email.`); return; }
    busy.current = true;
    setError('');
    setLoading(true);
    try {
      await api.auth.verifyOtp({ email, token: code, type: 'signup' });
      // signed in now; stay busy while the app loads (new hosts go through setup first)
      window.location.assign(appPath(safeReturnTo() === '/' ? '/dashboard' : safeReturnTo()));
    } catch (err) {
      setError(authErrorMessage(err, 'That code didn’t work. Try again.'));
      setLoading(false);
      busy.current = false;
    }
  };

  return (
    <AuthLayout
      icon={Mail}
      title="Confirm your email"
      subtitle={knownEmail ? <>We sent a code to <span className="font-semibold text-foreground">{email}</span></> : 'Enter the code from your confirmation email'}
      footer={
        <Link to="/register" className="text-link font-semibold hover:underline">
          <ArrowLeft className="w-3 h-3 inline mr-1" />Use a different email
        </Link>
      }
    >
      <form onSubmit={handleVerify} className="space-y-4" noValidate>
        {error && <div role="alert" className="p-3 rounded-lg bg-destructive/10 text-destructive text-sm">{error}</div>}
        {!knownEmail && (
          <div className="space-y-2">
            <Label htmlFor="email">Email</Label>
            <Input id="email" type="email" autoComplete="email" placeholder="you@example.com" maxLength={LIMITS.email} value={email} onChange={(e) => setEmail(onlyEmail(e.target.value))} className="h-12" required />
          </div>
        )}
        <div className="space-y-2">
          <Label htmlFor="code">Confirmation code</Label>
          <CodeInput value={code} onChange={setCode} autoFocus={knownEmail} />
          <p className="text-xs text-muted-foreground">It can take a minute to arrive, and may land in spam.</p>
        </div>
        <Button type="submit" className="w-full h-12 text-[15px] font-bold" disabled={loading}>
          {loading ? <><Loader2 className="w-4 h-4 mr-2 animate-spin" />Confirming...</> : 'Confirm and continue'}
        </Button>
        {email && (
          <p className="text-center text-sm text-muted-foreground">
            No email? <ResendEmailButton label="Send a new code" onResend={() => api.auth.resendSignup(email, safeReturnTo())} />
          </p>
        )}
      </form>
    </AuthLayout>
  );
}

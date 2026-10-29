import React, { useEffect, useRef, useState } from "react";
import { Link } from "react-router-dom";
import { api } from "@/lib/localApi";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Lock, Loader2, Eye, EyeOff, ArrowLeft } from "lucide-react";
import AuthLayout, { CodeInput, CODE_MIN, ResendEmailButton } from "@/components/Authlayout.jsx";
import { appPath, safeReturnTo, authErrorMessage } from "@/lib/authReturnTo";
import { LIMITS } from '@/lib/inputRules';

// Two ways in. With ?email= (from Forgot password or Settings): the emailed code plus the new
// password, on one screen. This has to be the page that checks the code: Supabase reports it as
// PASSWORD_RECOVERY, and Authcontext sends that event here. Without an email: an older reset link
// that already signed the person in, so only the new password is asked for.
export default function ResetPassword() {
  const [email] = useState(() => new URLSearchParams(window.location.search).get("email") || "");
  const withCode = Boolean(email);
  const [code, setCode] = useState("");
  const [newPassword, setNewPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);
  const busy = useRef(false);
  // a code works once: if it was accepted but the password then wasn't (too weak, same as before),
  // the next try only sets the password
  const verified = useRef(false);
  // link mode: null while checking; false when the link has expired or was already used
  const [linkValid, setLinkValid] = useState(withCode ? true : null);

  useEffect(() => {
    if (withCode) return undefined;
    let alive = true;
    api.auth.hasSession().then((ok) => { if (alive) setLinkValid(ok); }).catch(() => { if (alive) setLinkValid(false); });
    return () => { alive = false; };
  }, [withCode]);

  const handleSubmit = async (e) => {
    e.preventDefault();
    setError("");
    if (withCode && !verified.current && code.length < CODE_MIN) {
      setError(`Enter the ${CODE_MIN}-digit code from the email.`);
      return;
    }
    if (newPassword.length < 6) {
      setError("Use at least 6 characters for your password.");
      return;
    }
    if (newPassword !== confirmPassword) {
      setError("Passwords do not match");
      return;
    }
    if (busy.current) return;
    busy.current = true;
    setLoading(true);
    try {
      if (withCode && !verified.current) {
        await api.auth.verifyOtp({ email, token: code, type: "recovery" });
        verified.current = true;
      } else if (!withCode && !(await api.auth.hasSession())) {
        setLinkValid(false);
        setLoading(false);
        busy.current = false;
        return;
      }
      await api.auth.resetPassword({ newPassword });
      // signed in with the new password; stay busy while the app loads
      window.location.assign(appPath(safeReturnTo() === "/" ? "/dashboard" : safeReturnTo()));
    } catch (err) {
      setError(authErrorMessage(err, "Failed to reset password"));
      setLoading(false);
      busy.current = false;
    }
  };

  if (linkValid === false) {
    return (
      <AuthLayout icon={Lock} title="This link has expired" subtitle="Reset links work once and expire after a while.">
        <Button asChild className="w-full h-12 text-[15px] font-bold">
          <Link to="/forgot-password">Send me a code</Link>
        </Button>
      </AuthLayout>
    );
  }

  return (
    <AuthLayout
      icon={Lock}
      title={withCode ? "Set a new password" : "New password"}
      subtitle={withCode ? <>We sent a code to <span className="font-semibold text-foreground">{email}</span></> : "Enter your new password below"}
      footer={withCode && (
        <Link to={`/forgot-password?${new URLSearchParams({ email })}`} className="text-link font-semibold hover:underline">
          <ArrowLeft className="w-3 h-3 inline mr-1" />Use a different email
        </Link>
      )}
    >
      {error && (
        <div role="alert" className="mb-4 p-3 rounded-lg bg-destructive/10 text-destructive text-sm">
          {error}
        </div>
      )}
      <form onSubmit={handleSubmit} className="space-y-4" noValidate>
        {withCode && (
          <div className="space-y-2">
            <Label htmlFor="code">Code from the email</Label>
            <CodeInput value={code} onChange={setCode} />
            <p className="text-sm text-muted-foreground">
              No email? It may be in spam. <ResendEmailButton label="Send a new code" onResend={() => api.auth.resetPasswordRequest(email)} />
            </p>
          </div>
        )}
        <div className="space-y-2">
          <Label htmlFor="password">New password</Label>
          <div className="relative">
            <Lock className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" aria-hidden="true" />
            <Input
              id="password"
              type={showPassword ? "text" : "password"}
              autoComplete="new-password"
              autoFocus={!withCode}
              placeholder="At least 6 characters"
              value={newPassword}
              onChange={(e) => setNewPassword(e.target.value)}
              className="pl-10 pr-12 h-12"
              minLength={6}
              maxLength={LIMITS.password}
              required
            />
            <button
              type="button"
              onClick={() => setShowPassword((v) => !v)}
              aria-label={showPassword ? "Hide password" : "Show password"}
              aria-pressed={showPassword}
              className="absolute right-1 top-1/2 -translate-y-1/2 w-10 h-10 rounded-full flex items-center justify-center text-muted-foreground transition-all duration-200 hover:bg-secondary hover:text-foreground"
            >
              {showPassword ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
            </button>
          </div>
        </div>
        <div className="space-y-2">
          <Label htmlFor="confirm">Confirm password</Label>
          <div className="relative">
            <Lock className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" aria-hidden="true" />
            <Input
              id="confirm"
              type={showPassword ? "text" : "password"}
              autoComplete="new-password"
              placeholder="••••••••"
              value={confirmPassword}
              onChange={(e) => setConfirmPassword(e.target.value)}
              maxLength={LIMITS.password}
              className="pl-10 h-12"
              required
            />
          </div>
        </div>
        <Button type="submit" className="w-full h-12 text-[15px] font-bold" disabled={loading || linkValid === null}>
          {loading ? (
            <>
              <Loader2 className="w-4 h-4 mr-2 animate-spin" />
              Saving...
            </>
          ) : (
            "Save new password"
          )}
        </Button>
      </form>
    </AuthLayout>
  );
}

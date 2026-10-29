import React, { useState } from "react";
import { Link } from "react-router-dom";
import { api } from "@/lib/localApi";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { LogIn, Mail, Lock, Loader2, Eye, EyeOff } from "lucide-react";
import AuthLayout, { ResendEmailButton } from "@/components/Authlayout.jsx";
import GoogleIcon from "@/components/googleicon.jsx";
import LinkedInIcon from "@/components/linkedinicon.jsx";
import { appPath, safeReturnTo, authErrorMessage } from "@/lib/authReturnTo";

// an auth link that failed (expired, already used, Google cancelled) leaves its message here;
// see the inline script in index.html
const takeAuthError = () => {
  try {
    const message = sessionStorage.getItem('gm-auth-error');
    sessionStorage.removeItem('gm-auth-error');
    return message;
  } catch {
    return null;
  }
};

export default function Login() {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [unconfirmed, setUnconfirmed] = useState(false);
  const [error, setError] = useState(() => takeAuthError() || (new URLSearchParams(window.location.search).get('google_error') === 'not_configured'
    ? 'Google sign-in is not configured. Add the Google OAuth values to your .env file.'
    : ''));
  const [loading, setLoading] = useState(false);
  // Post-login destination (e.g. the MCP OAuth consent page sends users here
  // with returnTo so the grant flow can resume). Same-origin paths only.
  const returnTo = safeReturnTo();

  const handleSubmit = async (e) => {
    e.preventDefault();
    setError("");
    setUnconfirmed(false);
    if (loading) return;
    setLoading(true);
    try {
      await api.auth.loginViaEmailPassword(email, password);
      // stays "Logging in..." while the page loads, so the button can't sign in twice
      window.location.href = appPath(returnTo);
    } catch (err) {
      setUnconfirmed(err.code === "email_not_confirmed");
      setError(err.code === "invalid_credentials" ? "That email and password don’t match. Try again, or reset your password." : authErrorMessage(err, "Invalid email or password"));
      setLoading(false);
      // the disabled button dropped keyboard focus to the page; put it back on the form
      document.getElementById("password")?.focus();
    }
  };

  const handleGoogle = () => {
    setError("");
    api.auth.loginWithGoogle(returnTo).catch((err) => setError(authErrorMessage(err, "Could not start Google sign-in")));
  };

  const handleLinkedIn = () => {
    setError("");
    api.auth.loginWithLinkedIn(returnTo).catch((err) => setError(authErrorMessage(err, "Could not start LinkedIn sign-in")));
  };

  return (
    <AuthLayout
      icon={LogIn}
      title="Log in to your account"
      subtitle="Welcome back to GlassMeet"
      footer={
        <>
          Don't have an account?{" "}
          <Link
            to={"/register" + (returnTo !== "/" ? "?returnTo=" + encodeURIComponent(returnTo) : "")}
            className="text-link font-semibold hover:underline"
          >
            Create one
          </Link>
        </>
      }
    >
      <div className="mb-6 space-y-3">
        <Button type="button" variant="outline" className="h-12 w-full text-[15px] font-bold" onClick={handleGoogle}>
          <GoogleIcon className="mr-2 h-5 w-5" /> Continue with Google
        </Button>
        <Button type="button" variant="outline" className="h-12 w-full text-[15px] font-bold" onClick={handleLinkedIn}>
          <LinkedInIcon className="mr-2 h-5 w-5" /> Continue with LinkedIn
        </Button>
      </div>
      <div className="relative mb-6">
        <div className="absolute inset-0 flex items-center"><div className="w-full border-t border-border" /></div>
        <div className="relative flex justify-center text-sm"><span className="bg-card px-3 text-muted-foreground">OR</span></div>
      </div>
      {error && (
        <div role="alert" className="mb-4 p-3 rounded-lg bg-destructive/10 text-destructive text-sm">
          {error}
          {unconfirmed && (
            <span className="mt-2 flex flex-wrap gap-x-4 gap-y-1">
              <Link to={`/verify?${new URLSearchParams({ email: email.trim(), ...(returnTo !== "/" ? { returnTo } : {}) })}`} className="font-semibold underline">Enter your code</Link>
              <ResendEmailButton label="Send a new code" onResend={() => api.auth.resendSignup(email, returnTo)} />
            </span>
          )}
        </div>
      )}

      <form onSubmit={handleSubmit} className="space-y-4">
        <div className="space-y-2">
          <Label htmlFor="email">Email</Label>
          <div className="relative">
            <Mail className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" aria-hidden="true" />
            <Input
              id="email"
              type="email"
              autoComplete="email"
              autoFocus
              placeholder="you@example.com"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              className="pl-10 h-12"
              required
            />
          </div>
        </div>
        <div className="space-y-2">
          <div className="flex items-center justify-between">
            <Label htmlFor="password">Password</Label>
            <Link to={"/forgot-password" + (email ? "?email=" + encodeURIComponent(email) : "")} className="text-sm font-semibold text-link hover:underline">
              Forgot password?
            </Link>
          </div>
          <div className="relative">
            <Lock className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" aria-hidden="true" />
            <Input
              id="password"
              type={showPassword ? "text" : "password"}
              autoComplete="current-password"
              placeholder="••••••••"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              className="pl-10 pr-12 h-12"
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
        <Button type="submit" className="w-full h-12 text-[15px] font-bold" disabled={loading}>
          {loading ? (
            <>
              <Loader2 className="w-4 h-4 mr-2 animate-spin" />
              Logging in...
            </>
          ) : (
            "Log in"
          )}
        </Button>
      </form>
    </AuthLayout>
  );
}

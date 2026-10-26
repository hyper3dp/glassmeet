import React, { useState } from "react";
import { Link } from "react-router-dom";
import { api } from "@/lib/localApi";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { UserPlus, Mail, Lock, Loader2, User, Eye, EyeOff } from "lucide-react";
import AuthLayout from "@/components/Authlayout.jsx";
import GoogleIcon from "@/components/googleicon.jsx";
import { appPath, safeReturnTo } from "@/lib/authReturnTo";

export default function Register() {
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const [loading, setLoading] = useState(false);

  const handleSubmit = async (e) => {
    e.preventDefault();
    setError("");
    if (password.length < 6) {
      setError("Use at least 6 characters for your password.");
      return;
    }
    setLoading(true);
    try {
      // the name is what guests see on your booking pages
      const result = await api.auth.register({ email, password, full_name: name.trim() });
      // signed in straight away when email confirmation is off
      if (result.access_token) window.location.assign(appPath(safeReturnTo()));
      else setNotice("Check your email for a confirmation link before signing in.");
    } catch (err) {
      setError(err.message || "Registration failed");
    } finally {
      setLoading(false);
    }
  };

  const handleGoogle = () => {
    setError("");
    api.auth.loginWithGoogle(safeReturnTo()).catch((err) => setError(err.message || "Could not start Google sign-in"));
  };

  return (
    <AuthLayout
      icon={UserPlus}
      title="Create your free account"
      subtitle="Share one link. Confirm on WhatsApp."
      footer={
        <>
          Already have an account?{" "}
          <Link
            to={"/login" + (safeReturnTo() !== "/" ? "?returnTo=" + encodeURIComponent(safeReturnTo()) : "")}
            className="text-link font-semibold hover:underline"
          >
            Log in
          </Link>
        </>
      }
    >
      <Button type="button" variant="outline" className="mb-6 h-12 w-full text-[15px] font-bold" onClick={handleGoogle}>
        <GoogleIcon className="mr-2 h-5 w-5" /> Continue with Google
      </Button>
      <div className="relative mb-6">
        <div className="absolute inset-0 flex items-center"><div className="w-full border-t border-border" /></div>
        <div className="relative flex justify-center text-sm"><span className="bg-card px-3 text-muted-foreground">OR</span></div>
      </div>
      {error && (
        <div role="alert" className="mb-4 p-3 rounded-lg bg-destructive/10 text-destructive text-sm">
          {error}
        </div>
      )}

      {notice ? (
        <div role="status" className="rounded-lg border border-border bg-secondary p-4 text-sm">
          <p className="font-semibold text-foreground">Check your email</p>
          <p className="mt-1 text-muted-foreground">We sent a confirmation link to <span className="font-semibold text-foreground">{email}</span>. Open it to finish creating your account. It can take a minute, and may land in spam.</p>
          <button type="button" onClick={() => setNotice("")} className="mt-3 font-semibold text-link hover:underline">Use a different email</button>
        </div>
      ) : (
      <form onSubmit={handleSubmit} className="space-y-4">
        <div className="space-y-2">
          <Label htmlFor="name">Your name</Label>
          <div className="relative">
            <User className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" aria-hidden="true" />
            <Input
              id="name"
              autoComplete="name"
              autoFocus
              maxLength={80}
              placeholder="Sara Ahmed"
              value={name}
              onChange={(e) => setName(e.target.value)}
              className="pl-10 h-12"
              required
            />
          </div>
          <p className="text-xs text-muted-foreground">Shown to guests on your booking pages.</p>
        </div>
        <div className="space-y-2">
          <Label htmlFor="email">Email</Label>
          <div className="relative">
            <Mail className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" aria-hidden="true" />
            <Input
              id="email"
              type="email"
              autoComplete="email"
              placeholder="you@example.com"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              className="pl-10 h-12"
              required
            />
          </div>
        </div>
        <div className="space-y-2">
          <Label htmlFor="password">Password</Label>
          <div className="relative">
            <Lock className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" aria-hidden="true" />
            <Input
              id="password"
              type={showPassword ? "text" : "password"}
              autoComplete="new-password"
              placeholder="At least 6 characters"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              className="pl-10 pr-12 h-12"
              minLength={6}
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
              Creating account...
            </>
          ) : (
            "Create account"
          )}
        </Button>
        <p className="text-center text-xs leading-relaxed text-muted-foreground">
          By creating an account you agree to our{" "}
          <Link to="/terms" className="font-semibold text-link hover:underline">Terms of Service</Link> and{" "}
          <Link to="/privacy" className="font-semibold text-link hover:underline">Privacy Policy</Link>.
        </p>
      </form>
      )}
    </AuthLayout>
  );
}

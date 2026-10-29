import React, { useState } from "react";
import { Link } from "react-router-dom";
import { api } from "@/lib/localApi";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Mail, ArrowLeft, Loader2 } from "lucide-react";
import AuthLayout, { ResendEmailButton } from "@/components/Authlayout.jsx";
import { authErrorMessage } from "@/lib/authReturnTo";

export default function ForgotPassword() {
  const [email, setEmail] = useState(() => new URLSearchParams(window.location.search).get("email") || "");
  const [loading, setLoading] = useState(false);
  const [sent, setSent] = useState(false);
  const [error, setError] = useState("");

  const handleSubmit = async (e) => {
    e.preventDefault();
    if (loading) return;
    setLoading(true);
    setError("");
    try {
      // an unknown address already succeeds (no account lookup), so an error here is real:
      // offline, or the email rate limit. Saying "sent" then would leave them waiting.
      await api.auth.resetPasswordRequest(email);
      setSent(true);
    } catch (err) {
      setError(authErrorMessage(err, "Could not send the reset link. Try again."));
    } finally {
      setLoading(false);
    }
  };

  return (
    <AuthLayout
      icon={Mail}
      title="Reset password"
      subtitle="We will email you a secure password reset link"
      footer={
        <Link to="/login" className="text-link font-semibold hover:underline">
          <ArrowLeft className="w-3 h-3 inline mr-1" />Back to log in
        </Link>
      }
    >
      {sent ? (
        <div role="status" className="text-sm">
          <p className="text-foreground">If an account exists for <span className="font-semibold">{email}</span>, we sent it a password reset link. It can take a minute, and may land in spam.</p>
          <div className="mt-3 flex flex-wrap gap-x-5 gap-y-2">
            <ResendEmailButton onResend={() => api.auth.resetPasswordRequest(email)} />
            <button type="button" onClick={() => setSent(false)} className="font-semibold text-link hover:underline">Use a different email</button>
          </div>
        </div>
      ) : (
        <form onSubmit={handleSubmit} className="space-y-4">
          {error && <div role="alert" className="p-3 rounded-lg bg-destructive/10 text-destructive text-sm">{error}</div>}
          <div className="space-y-2">
            <Label htmlFor="email">Email address</Label>
            <div className="relative">
              <Mail className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" aria-hidden="true" />
              <Input
                id="email"
                type="email"
                autoComplete="email"
                autoFocus
                placeholder="you@example.com"
                value={email}
                onChange={(event) => setEmail(event.target.value)}
                className="pl-10 h-12"
                required
              />
            </div>
          </div>
          <Button type="submit" className="w-full h-12 text-[15px] font-bold" disabled={loading}>
            {loading ? <><Loader2 className="w-4 h-4 mr-2 animate-spin" />Sending...</> : "Send reset link"}
          </Button>
        </form>
      )}
    </AuthLayout>
  );
}

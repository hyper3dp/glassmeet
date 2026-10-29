import React, { useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { api } from "@/lib/localApi";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Mail, ArrowLeft, Loader2 } from "lucide-react";
import AuthLayout from "@/components/Authlayout.jsx";
import { authErrorMessage } from "@/lib/authReturnTo";

export default function ForgotPassword() {
  const [email, setEmail] = useState(() => new URLSearchParams(window.location.search).get("email") || "");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const navigate = useNavigate();

  const handleSubmit = async (e) => {
    e.preventDefault();
    if (loading) return;
    setLoading(true);
    setError("");
    try {
      // an unknown address already succeeds (no account lookup), so an error here is real:
      // offline, or the email rate limit. Saying "sent" then would leave them waiting.
      await api.auth.resetPasswordRequest(email.trim());
      // the email carries a code; it's entered with the new password on the next page
      navigate(`/reset-password?${new URLSearchParams({ email: email.trim() })}`);
    } catch (err) {
      setError(authErrorMessage(err, "Could not send the code. Try again."));
      setLoading(false);
    }
  };

  return (
    <AuthLayout
      icon={Mail}
      title="Reset password"
      subtitle="We’ll email you a code to set a new password"
      footer={
        <Link to="/login" className="text-link font-semibold hover:underline">
          <ArrowLeft className="w-3 h-3 inline mr-1" />Back to log in
        </Link>
      }
    >
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
          {loading ? <><Loader2 className="w-4 h-4 mr-2 animate-spin" />Sending...</> : "Send code"}
        </Button>
      </form>
    </AuthLayout>
  );
}

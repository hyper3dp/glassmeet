import React from 'react';
import { Link } from 'react-router-dom';
import { Shield, Check, Clock, Lock, AlertTriangle } from 'lucide-react';
import { GlassButton } from '@/components/glass';

export default function Terms() {
  return (
    <div className="min-h-screen bg-background text-foreground px-4 py-20">
      <div className="max-w-3xl mx-auto">
        <header className="text-center mb-12">
          <h1 className="text-4xl font-semibold mb-4">Terms of Service</h1>
          <p className="text-muted-foreground">Last Updated: October 2026</p>
        </header>

        <div className="space-y-8">
          <section className="glass-panel p-6 rounded-3xl">
            <div className="flex items-center gap-3 mb-4 text-accent">
              <Shield className="w-6 h-6" />
              <h2 className="text-xl font-semibold">1. Acceptance of Terms</h2>
            </div>
            <p className="text-muted-foreground leading-relaxed">
              By creating an account or using GlassMeet, you agree to be bound by these Terms of Service. 
              If you do not agree to these terms, please do not use the service.
            </p>
          </section>

          <section className="glass-panel p-6 rounded-3xl">
            <div className="flex items-center gap-3 mb-4 text-accent">
              <Lock className="w-6 h-6" />
              <h2 className="text-xl font-semibold">2. User Accounts & Security</h2>
            </div>
            <p className="text-muted-foreground leading-relaxed mb-4">
              You are responsible for maintaining the security of your account and any associated 
              Google Calendar credentials. You agree to provide accurate and current information.
            </p>
            <div className="bg-accent/10 p-4 rounded-2xl border border-accent/20 text-sm text-accent">
              <strong>Security Note:</strong> GlassMeet uses OAuth 2.0 to access your calendar. We never store your Google password.
            </div>
          </section>

          <section className="glass-panel p-6 rounded-3xl">
            <div className="flex items-center gap-3 mb-4 text-accent">
              <Clock className="w-6 h-6" />
              <h2 className="text-xl font-semibold">3. Calendar Integration</h2>
            </div>
            <p className="text-muted-foreground leading-relaxed">
              GlassMeet connects to your Google Calendar to check availability and create events. 
              By linking your account, you grant GlassMeet permission to manage your bookings 
              according to the settings you define in the app.
            </p>
          </section>

          <section className="glass-panel p-6 rounded-3xl">
            <div className="flex items-center gap-3 mb-4 text-accent">
              <Check className="w-6 h-6" />
              <h2 className="text-xl font-semibold">4. WhatsApp Notifications</h2>
            </div>
            <p className="text-muted-foreground leading-relaxed">
              You acknowledge that GlassMeet facilitates bookings that flow into WhatsApp. 
              While we strive for 100% reliability, we are not responsible for delays 
              or delivery failures within the WhatsApp messaging infrastructure.
            </p>
          </section>

          <section className="glass-panel p-6 rounded-3xl border-destructive/20">
            <div className="flex items-center gap-3 mb-4 text-destructive">
              <AlertTriangle className="w-6 h-6" />
              <h2 className="text-xl font-semibold">5. Limitation of Liability</h2>
            </div>
            <p className="text-muted-foreground leading-relaxed">
              GlassMeet is provided "as is" without any warranties. We are not liable for any 
              missed meetings, data loss, or technical glitches resulting from the use of 
              the service or its integration with third-party APIs.
            </p>
          </section>
        </div>

        <footer className="mt-12 text-center">
          <Link to="/">
            <GlassButton variant="ghost">Return to Home</GlassButton>
          </Link>
        </footer>
      </div>
    </div>
  );
}

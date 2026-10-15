import React from 'react';
import { Link } from 'react-router-dom';
import { Eye, Lock, Database, Globe, UserCheck, Trash2 } from 'lucide-react';
import { GlassButton } from '@/components/glass';

export default function Privacy() {
  return (
    <div className="min-h-screen bg-background text-foreground px-4 py-20">
      <div className="max-w-3xl mx-auto">
        <header className="text-center mb-12">
          <h1 className="text-4xl font-semibold mb-4">Privacy Policy</h1>
          <p className="text-muted-foreground">Last Updated: October 2026</p>
        </header>

        <div className="space-y-8">
          <section className="glass-panel p-6 rounded-3xl">
            <div className="flex items-center gap-3 mb-4 text-accent">
              <Eye className="w-6 h-6" />
              <h2 className="text-xl font-semibold">1. Information We Collect</h2>
            </div>
            <p className="text-muted-foreground leading-relaxed mb-4">
              We collect minimal data to make GlassMeet functional:
            </p>
            <ul className="list-disc list-inside space-y-2 text-sm text-muted-foreground">
              <li>Account info (Email, Full Name) via Google OAuth.</li>
              <li>Calendar IDs and refresh tokens for availability syncing.</li>
              <li>Booking data (Guest name, email, and time slots).</li>
              <li>User preferences (Theme, accent colors).</li>
            </ul>
          </section>

          <section className="glass-panel p-6 rounded-3xl">
            <div className="flex items-center gap-3 mb-4 text-accent">
              <Lock className="w-6 h-6" />
              <h2 className="text-xl font-semibold">2. How We Use Your Data</h2>
            </div>
            <p className="text-muted-foreground leading-relaxed">
              Your data is used exclusively to:
              <ul className="list-disc list-inside mt-2 space-y-2 text-sm text-muted-foreground">
                <li>Manage your scheduling and bookings.</li>
                <li>Sync your availability with Google Calendar.</li>
                <li>Send booking notifications via WhatsApp.</li>
              </ul>
            </p>
          </section>

          <section className="glass-panel p-6 rounded-3xl">
            <div className="flex items-center gap-3 mb-4 text-accent">
              <Database className="w-6 h-6" />
              <h2 className="text-xl font-semibold">3. Data Storage & Security</h2>
            </div>
            <p className="text-muted-foreground leading-relaxed">
              We use Supabase for secure data storage. All sensitive tokens (like Google refresh tokens) 
              are stored using industry-standard encryption. We do not sell your data to third parties.
            </p>
          </section>

          <section className="glass-panel p-6 rounded-3xl">
            <div className="flex items-center gap-3 mb-4 text-accent">
              <Globe className="w-6 h-6" />
              <h2 className="text-xl font-semibold">4. Third-Party Services</h2>
            </div>
            <p className="text-muted-foreground leading-relaxed">
              GlassMeet integrates with Google (Calendar/Auth) and WhatsApp. Your data is subject 
              to the privacy policies of these providers.
            </p>
          </section>

          <section className="glass-panel p-6 rounded-3xl">
            <div className="flex items-center gap-3 mb-4 text-accent">
              <UserCheck className="w-6 h-6" />
              <h2 className="text-xl font-semibold">5. Your Rights</h2>
            </div>
            <p className="text-muted-foreground leading-relaxed">
              You can request the deletion of your account and all associated data at any time 
              through the settings menu or by contacting us.
            </p>
          </section>

          <section className="glass-panel p-6 rounded-3xl border-destructive/20">
            <div className="flex items-center gap-3 mb-4 text-destructive">
              <Trash2 className="w-6 h-6" />
              <h2 className="text-xl font-semibold">6. Data Retention</h2>
            </div>
            <p className="text-muted-foreground leading-relaxed">
              We retain your data for as long as your account is active. Once deleted, 
              your records are permanently removed from our database.
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

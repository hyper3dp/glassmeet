import React, { useEffect } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { Sparkles, Calendar, MessageCircle, Clock, Check, ArrowRight, Bell, Share2 } from 'lucide-react';
import { cn } from '@/lib/utils';
import { GlassButton } from '@/components/glass';
import { useAuth } from '@/lib/Authcontext.jsx';

const FEATURES = [
  { icon: Calendar, title: 'Simple scheduling', desc: 'Create event types in seconds. Share a link. Guests pick a time — done.' },
  { icon: MessageCircle, title: 'WhatsApp-first', desc: 'Every booking flows into WhatsApp. Confirmations and reminders, automatically.' },
  { icon: Clock, title: 'Smart availability', desc: 'Set working hours, breaks, and buffer time. Double-booking is impossible.' },
  { icon: Sparkles, title: 'Beautiful booking pages', desc: 'A polished, glassy page for every event. Premium on every screen size.' },
  { icon: Bell, title: 'Automatic reminders', desc: 'Guests get a nudge 24 hours and 1 hour before. Fewer no-shows.' },
  { icon: Share2, title: 'Share anywhere', desc: 'One tap to WhatsApp, copy link, or send. Your calendar, everywhere.' },
];

export default function Landing() {
  const { isAuthenticated, authChecked } = useAuth();
  const navigate = useNavigate();

  useEffect(() => {
    if (isAuthenticated && authChecked) {
      navigate('/dashboard', { replace: true });
    }
  }, [isAuthenticated, authChecked, navigate]);

  return (
    <div className="min-h-screen">
      {/* Nav */}
      <header className="fixed top-4 left-4 right-4 z-50">
        <div className="glass-panel max-w-6xl mx-auto flex items-center justify-between px-5 py-3">
          <div className="flex items-center gap-2.5">
            <div className="w-9 h-9 rounded-xl accent-bg flex items-center justify-center shadow-lg">
              <Sparkles className="w-5 h-5 text-white" />
            </div>
            <span className="font-semibold text-lg">GlassMeet</span>
          </div>
          <div className="hidden sm:flex items-center gap-2">
            <Link to="/login"><GlassButton variant="ghost" size="sm">Sign in</GlassButton></Link>
            <Link to="/register"><GlassButton variant="primary" size="sm">Get started</GlassButton></Link>
          </div>
          <div className="sm:hidden">
            <Link to="/register"><GlassButton variant="primary" size="sm">Get started</GlassButton></Link>
          </div>
        </div>
      </header>

      {/* Hero */}
      <section className="pt-36 pb-20 px-4">
        <div className="max-w-5xl mx-auto text-center">
          <div className="inline-flex items-center gap-2 glass rounded-full px-4 py-1.5 text-xs font-medium text-muted-foreground mb-6 animate-fade-in">
            <span className="w-2 h-2 rounded-full accent-bg animate-pulse" />
            WhatsApp-first scheduling
          </div>
          <h1 className="text-4xl sm:text-6xl lg:text-7xl font-semibold tracking-tight leading-[1.05] mb-5 animate-slide-up">
            Schedule meetings.
            <br />
            <span className="accent-text">Stay on WhatsApp.</span>
          </h1>
          <p className="text-lg sm:text-xl text-muted-foreground max-w-2xl mx-auto mb-9 animate-slide-up" style={{ animationDelay: '0.05s' }}>
            Beautiful scheduling for people who actually use WhatsApp.
          </p>
          <div className="flex flex-col sm:flex-row items-center justify-center gap-3 animate-slide-up" style={{ animationDelay: '0.1s' }}>
            <Link to="/register"><GlassButton variant="primary" size="lg">Get Started <ArrowRight className="w-4 h-4" /></GlassButton></Link>
            <a href="#how"><GlassButton size="lg">See how it works</GlassButton></a>
          </div>
        </div>

        {/* Glass preview */}
        <div className="max-w-4xl mx-auto mt-16 animate-scale-in" style={{ animationDelay: '0.15s' }}>
          <div className="glass-panel p-5 sm:p-8 relative overflow-hidden">
            <div className="absolute -top-20 -right-20 w-64 h-64 rounded-full accent-bg opacity-10 blur-3xl" />
            <div className="grid sm:grid-cols-2 gap-5 relative">
              <div className="space-y-4">
                <div className="flex items-center gap-3">
                  <div className="w-12 h-12 rounded-2xl glass flex items-center justify-center">
                    <Calendar className="w-6 h-6 accent-text" />
                  </div>
                  <div>
                    <div className="font-semibold">30 Minute Meeting</div>
                    <div className="text-xs text-muted-foreground">30 min · WhatsApp Call</div>
                  </div>
                </div>
                <div className="glass rounded-2xl p-4">
                  <div className="grid grid-cols-7 gap-1.5 text-center">
                    {['S','M','T','W','T','F','S'].map((d,i)=>(
                      <div key={i} className="text-[10px] text-muted-foreground py-1">{d}</div>
                    ))}
                    {Array.from({length:21}).map((_,i)=>(
                      <div key={i} className={cn(i===10?'accent-bg text-white':'glass','aspect-square rounded-lg flex items-center justify-center text-xs')}>{i+1}</div>
                    ))}
                  </div>
                </div>
              </div>
              <div className="space-y-2.5">
                <div className="text-sm font-medium text-muted-foreground mb-1">Available times</div>
                {['9:00 AM','9:30 AM','10:00 AM','11:30 AM','2:00 PM','3:30 PM'].map((t,i)=>(
                  <div key={i} className={cn('glass-button rounded-xl px-4 py-3 text-sm font-medium text-center', i===2 && 'accent-bg text-white border-transparent')}>
                    {t}
                  </div>
                ))}
                <div className="glass-button accent-bg text-white border-transparent rounded-xl px-4 py-3 text-sm font-medium flex items-center justify-center gap-2 mt-3">
                  <MessageCircle className="w-4 h-4" /> Confirm on WhatsApp
                </div>
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* Features */}
      <section id="how" className="px-4 py-16">
        <div className="max-w-6xl mx-auto">
          <div className="text-center mb-12">
            <h2 className="text-3xl sm:text-4xl font-semibold tracking-tight mb-3">Everything scheduling should be</h2>
            <p className="text-muted-foreground max-w-xl mx-auto">A calm, premium experience built around how you actually communicate.</p>
          </div>
          <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-5">
            {FEATURES.map((f, i) => (
              <div key={i} className="glass-card p-6 animate-fade-in" style={{ animationDelay: `${i*0.05}s` }}>
                <div className="w-11 h-11 rounded-2xl glass flex items-center justify-center mb-4">
                  <f.icon className="w-5 h-5 accent-text" />
                </div>
                <h3 className="font-semibold mb-1.5">{f.title}</h3>
                <p className="text-sm text-muted-foreground leading-relaxed">{f.desc}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* CTA */}
      <section className="px-4 py-20">
        <div className="max-w-3xl mx-auto text-center glass-card p-10 relative overflow-hidden">
          <div className="absolute -top-24 -left-24 w-64 h-64 rounded-full accent-bg opacity-10 blur-3xl" />
          <h2 className="text-3xl sm:text-4xl font-semibold mb-4 relative">You're one link away</h2>
          <p className="text-muted-foreground mb-7 relative">Create your booking page in minutes. Share it on WhatsApp. Watch your calendar fill.</p>
          <Link to="/register"><GlassButton variant="primary" size="lg">Get Started — it's free</GlassButton></Link>
        </div>
      </section>

      <footer className="px-4 py-10 text-center text-sm text-muted-foreground">
        <div className="flex items-center justify-center gap-2 mb-2">
          <Sparkles className="w-4 h-4 accent-text" /> GlassMeet
        </div>
        <p>Schedule meetings. Stay on WhatsApp.</p>
      </footer>
    </div>
  );
}
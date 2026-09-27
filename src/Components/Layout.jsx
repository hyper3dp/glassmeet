import React, { useEffect, useState } from 'react';
import { NavLink, useLocation, useNavigate } from 'react-router-dom';
import {
  LayoutDashboard, Calendar as CalendarIcon, CalendarClock, BookOpen, Clock,
  MessageCircle, Settings as SettingsIcon, Plus, LogOut, Sparkles, CalendarCheck,
  BarChart3, Menu, X, Search, Users,
} from 'lucide-react';
import { api } from '@/lib/localApi';
import { cn } from '@/lib/utils';
import { GlassButton } from '@/components/glass';
import NotificationCenter from '@/components/NotificationCenter';

const DESKTOP_NAV = [
  { to: '/dashboard', label: 'Dashboard', icon: LayoutDashboard },
  { to: '/calendar', label: 'Calendar', icon: CalendarIcon },
  { to: '/event-types', label: 'Event Types', icon: CalendarClock },
  { to: '/bookings', label: 'Bookings', icon: BookOpen },
  { to: '/guests', label: 'Guests', icon: Users },
  { to: '/availability', label: 'Availability', icon: Clock },
  { to: '/analytics', label: 'Analytics', icon: BarChart3 },
  { to: '/whatsapp', label: 'WhatsApp', icon: MessageCircle },
  { to: '/calendar-connections', label: 'Calendars', icon: CalendarCheck },
  { to: '/settings', label: 'Settings', icon: SettingsIcon },
];

const MOBILE_NAV = [
  { to: '/dashboard', label: 'Home', icon: LayoutDashboard },
  { to: '/calendar', label: 'Calendar', icon: CalendarIcon },
  { to: '/bookings', label: 'Bookings', icon: BookOpen },
  { to: '/settings', label: 'Settings', icon: SettingsIcon },
];

export default function Layout({ children, profile, onOpenCommandPalette }) {
  const location = useLocation();
  const navigate = useNavigate();
  const [tabletNavOpen, setTabletNavOpen] = useState(false);

  // Apply accent color + theme globally
  useEffect(() => {
    if (profile?.accent_color) {
      const hsl = hexToHslString(profile.accent_color);
      document.documentElement.style.setProperty('--accent-color', hsl);
      document.documentElement.style.setProperty('--ring', hsl);
    }
    if (profile?.theme) {
      document.documentElement.setAttribute('data-theme', profile.theme);
    }
  }, [profile?.accent_color, profile?.theme]);

  // Close tablet nav on route change
  useEffect(() => { setTabletNavOpen(false); }, [location.pathname]);

  const handleLogout = async () => {
    await api.auth.logout();
    window.location.href = '/login';
  };

  const NavLinks = ({ nav }) => (
    <nav className="flex-1 flex flex-col gap-1 overflow-y-auto no-scrollbar">
      {nav.map((item) => (
        <NavLink
          key={item.to}
          to={item.to}
          className={({ isActive }) =>
            cn('glass-nav-item flex items-center gap-3 px-3 py-2.5 rounded-xl text-sm font-medium text-muted-foreground',
              isActive && 'active text-foreground')
          }
        >
          <item.icon className="w-[18px] h-[18px]" />
          {item.label}
        </NavLink>
      ))}
    </nav>
  );

  return (
    <div className="min-h-screen">
      {/* Desktop floating sidebar */}
      <aside className="hidden lg:flex fixed left-5 top-5 bottom-5 w-64 flex-col z-40">
        <div className="glass-panel flex flex-col h-full p-4">
          <div className="flex items-center justify-between px-2 py-3 mb-4">
            <div className="flex items-center gap-2.5">
              <div className="w-9 h-9 rounded-xl accent-bg flex items-center justify-center shadow-lg">
                <Sparkles className="w-5 h-5 text-white" />
              </div>
              <div>
                <div className="font-semibold text-foreground leading-tight">GlassMeet</div>
                <div className="text-[11px] text-muted-foreground">WhatsApp scheduling</div>
              </div>
            </div>
            <NotificationCenter />
          </div>

          {onOpenCommandPalette && (
            <button
              onClick={onOpenCommandPalette}
              className="glass-button rounded-xl px-3 py-2.5 text-sm text-muted-foreground flex items-center gap-2 mb-2"
            >
              <Search className="w-4 h-4" /> Quick search
              <kbd className="ml-auto text-[10px] glass rounded px-1.5 py-0.5">⌘K</kbd>
            </button>
          )}

          <NavLinks nav={DESKTOP_NAV} />

          <div className="mt-auto pt-3 border-t border-border/60 space-y-1">
            <GlassButton variant="primary" size="md" className="w-full" onClick={() => navigate('/event-types?new=true')}>
              <Plus className="w-4 h-4" /> Create event
            </GlassButton>
            <button
              onClick={handleLogout}
              className="glass-nav-item flex items-center gap-3 px-3 py-2.5 rounded-xl text-sm font-medium text-muted-foreground w-full"
            >
              <LogOut className="w-[18px] h-[18px]" /> Sign out
            </button>
          </div>
        </div>
      </aside>

      {/* Tablet collapsible sidebar */}
      <aside className={cn('hidden md:flex lg:hidden fixed inset-y-0 left-0 z-50 transition-transform', tabletNavOpen ? 'translate-x-0' : '-translate-x-full')}>
        <div className="glass-panel flex flex-col h-full w-64 p-4">
          <div className="flex items-center justify-between px-2 py-3 mb-4">
            <div className="flex items-center gap-2.5">
              <div className="w-9 h-9 rounded-xl accent-bg flex items-center justify-center shadow-lg">
                <Sparkles className="w-5 h-5 text-white" />
              </div>
              <div className="font-semibold leading-tight">GlassMeet</div>
            </div>
            <button onClick={() => setTabletNavOpen(false)} className="w-8 h-8 rounded-lg glass flex items-center justify-center"><X className="w-4 h-4" /></button>
          </div>
          <NavLinks nav={DESKTOP_NAV} />
          <div className="mt-auto pt-3 border-t border-border/60 space-y-1">
            <GlassButton variant="primary" size="md" className="w-full" onClick={() => navigate('/event-types?new=true')}>
              <Plus className="w-4 h-4" /> Create event
            </GlassButton>
            <button onClick={handleLogout} className="glass-nav-item flex items-center gap-3 px-3 py-2.5 rounded-xl text-sm font-medium text-muted-foreground w-full">
              <LogOut className="w-[18px] h-[18px]" /> Sign out
            </button>
          </div>
        </div>
      </aside>

      {/* Tablet top bar */}
      <header className="hidden md:flex lg:hidden fixed top-0 left-0 right-0 z-30 items-center justify-between px-4 py-3 glass-panel rounded-none border-x-0 border-t-0">
        <button onClick={() => setTabletNavOpen(true)} className="w-9 h-9 rounded-xl glass flex items-center justify-center"><Menu className="w-5 h-5" /></button>
        <div className="flex items-center gap-2">
          <Sparkles className="w-5 h-5 accent-text" />
          <span className="font-semibold">GlassMeet</span>
        </div>
        <NotificationCenter />
      </header>

      {tabletNavOpen && <div className="hidden md:block lg:hidden fixed inset-0 z-40 bg-black/30 backdrop-blur-sm" onClick={() => setTabletNavOpen(false)} />}

      {/* Main content */}
      <main className="lg:ml-[280px] min-h-screen pb-24 lg:pb-0 md:pt-16 lg:pt-0">
        <div className="px-4 sm:px-6 lg:px-8 py-5 max-w-7xl mx-auto">
          {children}
        </div>
      </main>

      {/* Mobile bottom nav */}
      <nav className="md:hidden fixed bottom-4 left-4 right-4 z-40">
        <div className="glass-panel flex items-center justify-around px-2 py-2">
          {MOBILE_NAV.map((item) => (
            <NavLink
              key={item.to}
              to={item.to}
              className={({ isActive }) =>
                cn('flex flex-col items-center gap-1 px-3 py-2 rounded-xl text-[11px] font-medium transition-all',
                  isActive ? 'accent-text' : 'text-muted-foreground')
              }
            >
              <item.icon className="w-5 h-5" />
              {item.label}
            </NavLink>
          ))}
          <NavLink
            to="/event-types?new=true"
            className="flex flex-col items-center gap-1 px-3 py-2 rounded-xl text-[11px] font-medium text-white"
          >
            <div className="w-8 h-8 rounded-xl accent-bg flex items-center justify-center -mt-3 shadow-lg">
              <Plus className="w-5 h-5" />
            </div>
            Create
          </NavLink>
        </div>
      </nav>
    </div>
  );
}

function hexToHslString(hex) {
  hex = hex.replace('#', '');
  let r = parseInt(hex.substring(0, 2), 16) / 255;
  let g = parseInt(hex.substring(2, 4), 16) / 255;
  let b = parseInt(hex.substring(4, 6), 16) / 255;
  const max = Math.max(r, g, b), min = Math.min(r, g, b);
  let h = 0, s = 0;
  const l = (max + min) / 2;
  if (max !== min) {
    const d = max - min;
    s = l > 0.5 ? d / (2 - max - min) : d / (max + min);
    switch (max) {
      case r: h = (g - b) / d + (g < b ? 6 : 0); break;
      case g: h = (b - r) / d + 2; break;
      case b: h = (r - g) / d + 4; break;
    }
    h /= 6;
  }
  return `${Math.round(h * 360)} ${Math.round(s * 100)}% ${Math.round(l * 100)}%`;
}
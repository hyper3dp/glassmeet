import { appPath } from '@/lib/authReturnTo';
import React, { useEffect, useState } from 'react';
import { NavLink, useLocation, useNavigate } from 'react-router-dom';
import {
  Home, Calendar as CalendarIcon, Link2, CalendarDays, Clock,
  MessageCircle, Settings as SettingsIcon, Plus, LogOut, CalendarCheck,
  BarChart3, Menu, X, Search, ChevronDown,
} from 'lucide-react';
import { api } from '@/lib/localApi';
import { cn } from '@/lib/utils';
import { Avatar } from '@/components/glass';
import Logo from '@/components/logo.jsx';
import NotificationCenter from '@/components/Notificationcenter.jsx';

const NAV = [
  { to: '/dashboard', label: 'Home', icon: Home },
  { to: '/event-types', label: 'Scheduling', icon: Link2 },
  { to: '/bookings', label: 'Meetings', icon: CalendarDays },
  { to: '/availability', label: 'Availability', icon: Clock },
  { to: '/calendar', label: 'Calendar', icon: CalendarIcon },
  { to: '/analytics', label: 'Analytics', icon: BarChart3 },
];

const INTEGRATIONS = [
  { to: '/whatsapp', label: 'WhatsApp', icon: MessageCircle },
  { to: '/calendar-connections', label: 'Calendars', icon: CalendarCheck },
];

const IS_MAC = typeof navigator !== 'undefined' && /Mac|iPhone|iPad/.test(navigator.platform);

const MOBILE_NAV = [
  { to: '/dashboard', label: 'Home', icon: Home },
  { to: '/event-types', label: 'Scheduling', icon: Link2 },
  { to: '/bookings', label: 'Meetings', icon: CalendarDays },
  { to: '/calendar', label: 'Calendar', icon: CalendarIcon },
];

export default function Layout({ children, profile, onOpenCommandPalette }) {
  const location = useLocation();
  const navigate = useNavigate();
  const [drawerOpen, setDrawerOpen] = useState(false);
  const [menuOpen, setMenuOpen] = useState(false);

  // Apply the user's accent colour globally (used for small dots only)
  useEffect(() => {
    if (profile?.accent_color) {
      const hsl = hexToHslString(profile.accent_color);
      document.documentElement.style.setProperty('--accent-color', hsl);
    }
  }, [profile?.accent_color]);

  // Close drawer and menus on route change
  useEffect(() => { setDrawerOpen(false); setMenuOpen(false); }, [location.pathname]);

  const handleLogout = async () => {
    await api.auth.logout();
    window.location.href = appPath('/login');
  };

  const navItem = ({ isActive }) =>
    cn('glass-nav-item flex items-center gap-3 px-3 h-10 rounded-lg text-sm font-semibold text-foreground',
      isActive && 'active');

  const Sidebar = ({ onClose }) => (
    <div className="flex h-full w-64 flex-col bg-sidebar border-r border-sidebar-border">
      <div className="flex items-center justify-between px-5 h-16">
        <Logo to="/dashboard" />
        {onClose && (
          <button onClick={onClose} aria-label="Close menu" className="w-8 h-8 rounded-full flex items-center justify-center text-muted-foreground hover:bg-secondary">
            <X className="w-4 h-4" />
          </button>
        )}
      </div>

      <div className="px-4 pb-4">
        <button
          type="button"
          onClick={() => navigate('/event-types?new=true')}
          className="w-full h-10 rounded-full border border-primary text-link font-semibold text-sm flex items-center justify-center gap-2 transition-all duration-200 hover:bg-primary-soft"
        >
          <Plus className="w-4 h-4" strokeWidth={2.5} /> Create
        </button>
      </div>

      <nav className="flex-1 overflow-y-auto no-scrollbar px-3 space-y-0.5" aria-label="Main">
        {NAV.map((item) => (
          <NavLink key={item.to} to={item.to} className={navItem}>
            <item.icon className="w-[18px] h-[18px]" />
            {item.label}
          </NavLink>
        ))}
        <div className="px-3 pt-5 pb-1.5 text-xs font-semibold text-muted-foreground">Integrations</div>
        {INTEGRATIONS.map((item) => (
          <NavLink key={item.to} to={item.to} className={navItem}>
            <item.icon className="w-[18px] h-[18px]" />
            {item.label}
          </NavLink>
        ))}
      </nav>

      <div className="px-3 py-3 border-t border-sidebar-border space-y-0.5">
        <NavLink to="/settings" className={navItem}>
          <SettingsIcon className="w-[18px] h-[18px]" /> Settings
        </NavLink>
        <button onClick={handleLogout} className="glass-nav-item w-full flex items-center gap-3 px-3 h-10 rounded-lg text-sm font-semibold text-muted-foreground">
          <LogOut className="w-[18px] h-[18px]" /> Sign out
        </button>
      </div>
    </div>
  );

  return (
    <div className="min-h-screen">
      {/* Desktop sidebar, flush to the edge */}
      <aside className="hidden lg:block fixed inset-y-0 left-0 z-40">
        <Sidebar />
      </aside>

      {/* Tablet / mobile drawer */}
      <aside className={cn('lg:hidden fixed inset-y-0 left-0 z-50 transition-transform duration-200', drawerOpen ? 'translate-x-0 shadow-pop' : '-translate-x-full invisible')}>
        <Sidebar onClose={() => setDrawerOpen(false)} />
      </aside>
      {drawerOpen && <div className="lg:hidden fixed inset-0 z-40 bg-scrim" onClick={() => setDrawerOpen(false)} />}

      <div className="lg:pl-64">
        {/* Top bar */}
        <header className="sticky top-0 z-30 h-16 bg-background border-b border-border lg:border-transparent">
          <div className="h-full max-w-6xl mx-auto px-4 sm:px-6 lg:px-10 flex items-center gap-3">
            <button onClick={() => setDrawerOpen(true)} aria-label="Open menu" className="lg:hidden w-10 h-10 -ml-2 rounded-full flex items-center justify-center hover:bg-secondary">
              <Menu className="w-5 h-5" />
            </button>
            <div className="lg:hidden"><Logo to="/dashboard" size="sm" /></div>

            <div className="ml-auto flex items-center gap-1.5">
              {onOpenCommandPalette && (
                <button
                  onClick={onOpenCommandPalette}
                  className="hidden sm:flex h-10 items-center gap-2 rounded-full border border-border bg-card pl-3.5 pr-2 text-sm text-muted-foreground transition-all duration-200 hover:border-border-hover"
                >
                  <Search className="w-4 h-4" /> Search
                  <kbd className="ml-6 rounded-md bg-secondary px-1.5 py-0.5 text-[11px] font-medium">{IS_MAC ? '⌘K' : 'Ctrl K'}</kbd>
                </button>
              )}
              <NotificationCenter />
              <div className="relative">
                <button
                  onClick={() => setMenuOpen((v) => !v)}
                  aria-expanded={menuOpen}
                  aria-label="Account menu"
                  className="flex items-center gap-1 rounded-full p-1 pr-2 transition-all duration-200 hover:bg-secondary"
                >
                  <Avatar src={profile?.profile_photo} name={profile?.full_name} size={32} />
                  <ChevronDown className="w-4 h-4 text-muted-foreground" />
                </button>
                {menuOpen && (
                  <>
                    <div className="fixed inset-0 z-40" onClick={() => setMenuOpen(false)} />
                    <div className="absolute right-0 top-12 z-50 w-64 rounded-xl border border-border bg-popover shadow-pop py-2 animate-scale-in">
                      <div className="px-4 py-2 border-b border-border mb-1">
                        <div className="text-sm font-bold truncate">{profile?.full_name || 'Your account'}</div>
                        {profile?.email && <div className="text-xs text-muted-foreground truncate">{profile.email}</div>}
                      </div>
                      <NavLink to="/settings" className="flex items-center gap-3 px-4 h-10 text-sm hover:bg-secondary"><SettingsIcon className="w-4 h-4 text-muted-foreground" /> Account settings</NavLink>
                      <NavLink to="/availability" className="flex items-center gap-3 px-4 h-10 text-sm hover:bg-secondary"><Clock className="w-4 h-4 text-muted-foreground" /> Availability</NavLink>
                      <button onClick={handleLogout} className="w-full flex items-center gap-3 px-4 h-10 text-sm hover:bg-secondary"><LogOut className="w-4 h-4 text-muted-foreground" /> Sign out</button>
                    </div>
                  </>
                )}
              </div>
            </div>
          </div>
        </header>

        <main className="min-h-[calc(100vh-4rem)] pb-24 md:pb-10">
          <div className="max-w-6xl mx-auto px-4 sm:px-6 lg:px-10 pt-4 sm:pt-6">
            {children}
          </div>
        </main>
      </div>

      {/* Mobile bottom tab bar */}
      <nav className="md:hidden fixed bottom-0 inset-x-0 z-40 bg-card border-t border-border pb-[env(safe-area-inset-bottom)]" aria-label="Mobile">
        <div className="flex items-stretch justify-around h-16">
          {MOBILE_NAV.slice(0, 2).map((item) => <MobileTab key={item.to} item={item} />)}
          <NavLink to="/event-types?new=true" aria-label="Create event" className="flex items-center justify-center px-2">
            <span className="w-11 h-11 rounded-full bg-primary text-primary-foreground flex items-center justify-center shadow-card">
              <Plus className="w-5 h-5" strokeWidth={2.5} />
            </span>
          </NavLink>
          {MOBILE_NAV.slice(2).map((item) => <MobileTab key={item.to} item={item} />)}
        </div>
      </nav>
    </div>
  );
}

function MobileTab({ item }) {
  return (
    <NavLink
      to={item.to}
      className={({ isActive }) =>
        cn('flex flex-1 flex-col items-center justify-center gap-1 text-[11px] font-semibold transition-all duration-200',
          isActive ? 'text-link' : 'text-muted-foreground')
      }
    >
      <item.icon className="w-5 h-5" />
      {item.label}
    </NavLink>
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

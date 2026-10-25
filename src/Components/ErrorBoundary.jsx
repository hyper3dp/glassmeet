import React from 'react';
import { RotateCcw } from 'lucide-react';
import { LogoMark } from '@/components/logo.jsx';

// Catches render errors so one broken page shows a way back instead of a blank screen.
// A failed lazy chunk (new deploy while the tab was open) reloads once automatically.
export default class ErrorBoundary extends React.Component {
  constructor(props) {
    super(props);
    this.state = { error: null };
  }

  static getDerivedStateFromError(error) {
    return { error };
  }

  componentDidCatch(error, info) {
    console.error('GlassMeet page error:', error, info?.componentStack);
    const chunkFailed = /Loading chunk|dynamically imported module|Importing a module script failed/i.test(String(error?.message));
    try {
      const last = Number(sessionStorage.getItem('gm-chunk-reload') || 0);
      if (chunkFailed && Date.now() - last > 30000) {
        sessionStorage.setItem('gm-chunk-reload', String(Date.now()));
        window.location.reload();
      }
    } catch { /* storage unavailable */ }
  }

  render() {
    if (!this.state.error) return this.props.children;
    return (
      <div className="min-h-[60vh] flex flex-col items-center justify-center gap-4 px-6 py-16 text-center">
        <LogoMark size={44} />
        <h1 className="text-xl font-bold">Something went wrong on this page</h1>
        <p className="max-w-sm text-sm text-muted-foreground">Reload to try again. If it keeps happening, tell us what you were doing.</p>
        <button
          type="button"
          onClick={() => window.location.reload()}
          className="h-10 px-5 rounded-full bg-primary text-primary-foreground text-sm font-semibold inline-flex items-center gap-2 transition-all duration-200 hover:bg-primary-hover"
        >
          <RotateCcw className="w-4 h-4" /> Reload
        </button>
      </div>
    );
  }
}

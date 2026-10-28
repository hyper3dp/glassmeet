import React from 'react'
import ReactDOM from 'react-dom/client'
import App from '@/APP.jsx'
import '@/Index.css'
import { isEmbed } from '@/lib/embed.js'

// GitHub Pages deep links (?__gh_pages_route=) are restored by an inline script in index.html,
// which runs before these imports create the Supabase client.

if (isEmbed()) document.documentElement.classList.add('embed');

// A redeploy replaces the hashed chunks, so a tab opened before it can fail to load a page's
// files: reload once to get the new ones. Same key and 30s limit as ErrorBoundary, so the two
// never reload twice; inside the limit (or offline) the error goes on to ErrorBoundary's message.
window.addEventListener('vite:preloadError', (event) => {
  if (navigator.onLine === false) return;
  try {
    const last = Number(sessionStorage.getItem('gm-chunk-reload') || 0);
    if (Date.now() - last > 30000) {
      sessionStorage.setItem('gm-chunk-reload', String(Date.now()));
      event.preventDefault();
      window.location.reload();
    }
  } catch { /* storage unavailable */ }
});

ReactDOM.createRoot(document.getElementById('root')).render(
  <App />
)

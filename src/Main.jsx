import React from 'react'
import ReactDOM from 'react-dom/client'
import App from '@/APP.jsx'
import '@/Index.css'

const route = new URLSearchParams(window.location.search).get('__gh_pages_route');
if (route) {
  const restored = new URL(route, window.location.origin);
  window.history.replaceState(null, '', `${restored.pathname}${restored.search}${restored.hash}`);
}

ReactDOM.createRoot(document.getElementById('root')).render(
  <App />
)

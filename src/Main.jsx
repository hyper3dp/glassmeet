import React from 'react'
import ReactDOM from 'react-dom/client'
import App from '@/APP.jsx'
import '@/Index.css'
import { isEmbed } from '@/lib/embed.js'

// GitHub Pages deep links (?__gh_pages_route=) are restored by an inline script in index.html,
// which runs before these imports create the Supabase client.

if (isEmbed()) document.documentElement.classList.add('embed');

ReactDOM.createRoot(document.getElementById('root')).render(
  <App />
)

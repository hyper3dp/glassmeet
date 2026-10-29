import react from '@vitejs/plugin-react'
import tailwindcss from '@tailwindcss/vite'
import { defineConfig } from 'vite'
import { fileURLToPath } from 'node:url'
import { copyFile, readFile, writeFile } from 'node:fs/promises'
import { createHash } from 'node:crypto'
import path from 'node:path'

// GitHub Pages only serves files that exist, so client-side routes like /privacy
// answer with a 404 status (404.html then redirects into the app). Crawlers such as
// Google's OAuth verification see that 404. Copying index.html to <route>.html lets
// Pages serve these routes directly with a 200; the app's router renders the page.
// served as real files, so links to them (including auth links carrying #tokens) skip 404.html
const STATIC_ROUTES = ['privacy', 'terms', 'login', 'register', 'forgot-password', 'reset-password', 'verify', 'dashboard'];

function staticRoutes() {
  let outDir;
  return {
    name: 'glassmeet-static-routes',
    apply: 'build',
    configResolved(config) {
      outDir = path.resolve(config.root, config.build.outDir);
    },
    async closeBundle() {
      await Promise.all(STATIC_ROUTES.map((route) =>
        copyFile(path.join(outDir, 'index.html'), path.join(outDir, `${route}.html`))));
    },
  };
}

// GitHub Pages can't send response headers, so the policies a page can set for itself go in
// <meta> tags: a Content-Security-Policy (each inline script allowed by its hash, not by
// 'unsafe-inline') and a Referrer-Policy. Build only: the dev server injects its own inline
// scripts. frame-ancestors, X-Frame-Options, X-Content-Type-Options and Permissions-Policy only
// work as real headers; public/_headers sets those on a host that supports it, and index.html
// guards against framing in the meantime.
const SUPABASE_ORIGIN = 'https://sjxraemrdpzleipfmwun.supabase.co'; // as in src/lib/supabaseClient.js

const inlineScriptHashes = (html) =>
  [...html.matchAll(/<script(?![^>]*\bsrc=)[^>]*>([\s\S]*?)<\/script>/g)]
    .filter((m) => m[1].trim())
    // browsers hash the script as parsed, where CRLF line endings have become LF
    .map((m) => `'sha256-${createHash('sha256').update(m[1].replace(/\r\n?/g, '\n')).digest('base64')}'`);

const securityMeta = (html) => {
  const csp = [
    "default-src 'self'",
    `script-src 'self' ${inlineScriptHashes(html).join(' ')}`.trim(),
    // React style={...} attributes and the inline background <style> need inline styles
    "style-src 'self' 'unsafe-inline'",
    // avatars (Supabase storage, Google photos) and QR codes come from other https hosts
    "img-src 'self' data: blob: https:",
    "font-src 'self' data:",
    `connect-src 'self' ${SUPABASE_ORIGIN} ${SUPABASE_ORIGIN.replace('https://', 'wss://')}`,
    "frame-src 'self'",
    "worker-src 'self' blob:",
    "object-src 'none'",
    "base-uri 'self'",
    "form-action 'self'",
    'upgrade-insecure-requests',
  ].join('; ');
  const tags = `<meta http-equiv="Content-Security-Policy" content="${csp}" />\n    <meta name="referrer" content="strict-origin-when-cross-origin" />\n    `;
  return html.replace(/<meta charset="utf-8" \/>\s*/i, (m) => `${m}${tags}`);
};

function securityHeaders() {
  let outDir;
  return {
    name: 'glassmeet-security-meta',
    apply: 'build',
    configResolved(config) {
      outDir = path.resolve(config.root, config.build.outDir);
    },
    transformIndexHtml: { order: 'post', handler: securityMeta },
    // public/404.html is copied as it is; give it the same tags
    async writeBundle() {
      const file = path.join(outDir, '404.html');
      await writeFile(file, securityMeta(await readFile(file, 'utf8')));
    },
  };
}

export default defineConfig({
  base: '/glassmeet/',
  plugins: [react(), tailwindcss(), securityHeaders(), staticRoutes()],
  build: {
    rolldownOptions: {
      output: {
        // Libraries every page loads get chunks of their own: they change far less often than the
        // app's code, so browsers keep them cached across deploys. Everything else splits by page.
        codeSplitting: {
          groups: [
            { name: 'react', test: /[\\/]node_modules[\\/](react|react-dom|scheduler|react-router|react-router-dom|@remix-run[\\/]router)[\\/]/, priority: 2 },
            { name: 'supabase', test: /[\\/]node_modules[\\/](@supabase[\\/]|iceberg-js[\\/]|tslib[\\/])/, priority: 1 },
          ],
        },
      },
    },
  },
  resolve: {
    alias: [
      { find: '@/components', replacement: fileURLToPath(new URL('./src/Components', import.meta.url)) },
      { find: '@', replacement: fileURLToPath(new URL('./src', import.meta.url)) },
    ],
  },
});

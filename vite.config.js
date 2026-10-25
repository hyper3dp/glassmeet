import react from '@vitejs/plugin-react'
import tailwindcss from '@tailwindcss/vite'
import { defineConfig } from 'vite'
import { fileURLToPath } from 'node:url'
import { copyFile } from 'node:fs/promises'
import path from 'node:path'

// GitHub Pages only serves files that exist, so client-side routes like /privacy
// answer with a 404 status (404.html then redirects into the app). Crawlers such as
// Google's OAuth verification see that 404. Copying index.html to <route>.html lets
// Pages serve these routes directly with a 200; the app's router renders the page.
// served as real files, so links to them (including auth links carrying #tokens) skip 404.html
const STATIC_ROUTES = ['privacy', 'terms', 'login', 'register', 'forgot-password', 'reset-password', 'dashboard'];

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

export default defineConfig({
  base: '/glassmeet/',
  plugins: [react(), tailwindcss(), staticRoutes()],
  resolve: {
    alias: [
      { find: '@/components', replacement: fileURLToPath(new URL('./src/Components', import.meta.url)) },
      { find: '@', replacement: fileURLToPath(new URL('./src', import.meta.url)) },
    ],
  },
});

# CLAUDE.md - glassmeet Developer Guide

This guide outlines the development environment, commands, and code styling rules for the **glassmeet** application stack. Refer to this file to maintain architectural consistency.

##  Quick Start / Commands

### Backend & Node.js

* **Install dependencies:** `npm install`
* **Start dev server:** `npm run dev`
* **Start production server:** `npm start`
* **Run linting:** `npm run lint`

### Supabase CLI (If local development is used)

* **Start Supabase locally:** `supabase start`
* **Stop Supabase:** `supabase stop`
* **Generate TypeScript/JS types:** `supabase gen types typescript --local > src/types/supabase.ts`

### Testing

* **Run all tests:** `npm test`
* **Run specific test file:** `npm test -- path/to/file.test.js`

---

## 🛠 Tech Stack & Architecture

* **App Name:** glassmeet
* **Backend & Database:** Node.js, Supabase (PostgreSQL, Auth, Storage, Realtime)
* **Frontend:** JSX / React components, HTML5, CSS3, Tailwind CSS
* **Future Stack:** iOS/macOS native integration via Swift (**⚠️ CURRENTLY INACTIVE - Do not write or suggest Swift code until explicitly instructed by the user**).

---

### General Principles

* **Active Focus:** Build and maintain the web platform using Node.js, JSX/HTML/CSS, Tailwind CSS, and Supabase.
* **Supabase First:** Leverage Supabase client SDKs for Authentication and Data Fetching where appropriate. Keep backend Node.js logic modular when handling secure server-side operations (like webhooks or edge functions).

### Node.js & JavaScript/JSX (Active)

* **Syntax:** Use modern ES6+ syntax (`const`/`let`, arrow functions, `async`/`await`).
* **JSX Structure:** Prefer functional components with hooks over class components. Integrate the Supabase Auth listener at the root level for session management.

### Database & Supabase Conventions

* **Database Naming:** Table names and column names should be short and concise (PostgreSQL standard).
* **Security:** Rely on Row Level Security (RLS) policies in Supabase to secure user data. Never bypass RLS in frontend clients.

### UI Design System & Styling (Active - Hilos / Modern Calendly Dark Aesthetic)

* **Goal:** Look like Calendly with a high-end dark SaaS aesthetic. Dark-only (next-themes is forced to `dark`; there is no light mode).
* **Stack:** Tailwind CSS v4 (CSS-first config in `src/Index.css`, `@tailwindcss/vite` plugin; there is no `tailwind.config.js`). shadcn/ui components live in `src/Components/ui/` (aliased as `@/components/ui`), restyled to this guide; add more with `npx shadcn@latest add <name>` and restyle them to match.
* **Palette (as tokens in `src/Index.css` — use the token classes, not raw hex):**
  * Base background `#09090b` → `bg-background`
  * Card & container surfaces `#121214` with a subtle matte grain → `bg-card` / the `matte` utility
  * Inputs & secondary elements `#18181b` → `bg-secondary`
  * Borders 1px `#27272a` → `border-border`, shifting to `#3f3f46` on hover → `hover:border-border-hover`
  * Text: primary `#fafafa` → `text-foreground`; secondary labels `#a1a1aa` → `text-muted-foreground`; muted hints `#52525b` → `text-hint`
* **Typography:** System sans-serif stack (`-apple-system`, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif), antialiased. Headings `tracking-tight`, medium–semibold. Labels & meta: uppercase `text-xs tracking-wider` in muted tones (`Label` / `.meta-label`).
* **Geometry:** Generous container padding (`p-6`–`p-8`), cards `rounded-2xl` (16px), form controls and buttons `rounded-xl`.
* **States:** All transitions `transition-all duration-200`. Active / selected pills and primary buttons invert to solid white with black text (`bg-primary text-primary-foreground`, i.e. `bg-white text-black`); inactive states stay matte dark with subtle borders.
* **Inputs:** `rounded-xl`, `bg-secondary`, focus border `zinc-500` (no glow rings); native date/dropdown pickers render dark via `color-scheme: dark`.
* **Scrollbars:** Ultra-thin, transparent track, rounded thumbs (global in `src/Index.css`).
* **Accent color:** Users may pick a personal accent in Settings; it sets `--accent-color` (HSL) and is used sparingly via `.accent-text` / `.accent-bg` for small icons and dots — never for active states. Public booking pages use the event's own color.
* **Components:** Prefer the shadcn components (`Button`, `Card`, `Input`, `Dialog`, `Switch`, ...). Page-level wrappers in `src/Components/glass.jsx` (`GlassCard`, `GlassButton`, ...) are built on them — use those for consistency on app pages.



###  Swift & iOS Rules ( STANDBY MODE - Active only when requested)

* **Syntax:** Use Swift 5+ modern syntax, favoring value types (`struct`) over reference types (`class`) for data models.
* **Architecture:** Utilize SwiftUI for the user interface and the MVVM or Composable Architecture patterns.
* **Data Mapping:** Enforce strict typing. All models must easily map to the Supabase database schema utilizing the native Supabase Swift SDK.

---

##  Security & Git

* **Environment variables:** Never hardcode secrets. Use `.env` for `SUPABASE_URL`, `SUPABASE_ANON_KEY`, and `SUPABASE_SERVICE_ROLE_KEY` (server-side only).
* **Git commits:** Use clear prefixes (e.g., `feat: glassmeet supabase auth setup`, `fix: resolve jsx style bleed`).
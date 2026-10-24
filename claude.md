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

### UI Design System & Styling (Active - shadcn/ui preset `b5cSpY31U`)

* **Source of truth:** shadcn/ui preset `b5cSpY31U` (https://ui.shadcn.com/create?preset=b5cSpY31U) — style `nova`, base color `mist`, theme & charts `teal`, font Inter, radius `large`, menu accent `bold`, icons `lucide`. Re-apply with `npx shadcn@latest apply b5cSpY31U`.
* **Stack:** Tailwind CSS v4 (CSS-first config in `src/Index.css`, `@tailwindcss/vite` plugin; there is no `tailwind.config.js`). Components live in `src/Components/ui/` (aliased as `@/components/ui`); add more with `npx shadcn@latest add <name>`.
* **Colors:** Use the semantic tokens only (`bg-background`, `bg-card`, `text-foreground`, `text-muted-foreground`, `bg-primary text-primary-foreground`, `border-border`, `ring-ring`). Never hardcode hex/zinc values — tokens switch between light and dark.
* **Modes:** Light, dark and system (next-themes, `class` strategy); users switch in Settings → Appearance.
* **Accent color:** Users may pick a personal accent in Settings; it sets `--accent-color` (HSL) and is used only via `.accent-text` / `.accent-bg` for icons and highlights. Default is the preset teal.
* **Active / selected states:** Solid primary fill (`bg-primary text-primary-foreground`), per the preset's bold menu accent.
* **Components:** Prefer shadcn components (`Button`, `Card`, `Input`, `Dialog`, `Switch`, ...). Page-level wrappers in `src/Components/glass.jsx` (`GlassCard`, `GlassButton`, ...) are built on them — use those for consistency on app pages.
* **Typography:** Inter (`@fontsource-variable/inter`), `tracking-tight` headings.



###  Swift & iOS Rules ( STANDBY MODE - Active only when requested)

* **Syntax:** Use Swift 5+ modern syntax, favoring value types (`struct`) over reference types (`class`) for data models.
* **Architecture:** Utilize SwiftUI for the user interface and the MVVM or Composable Architecture patterns.
* **Data Mapping:** Enforce strict typing. All models must easily map to the Supabase database schema utilizing the native Supabase Swift SDK.

---

##  Security & Git

* **Environment variables:** Never hardcode secrets. Use `.env` for `SUPABASE_URL`, `SUPABASE_ANON_KEY`, and `SUPABASE_SERVICE_ROLE_KEY` (server-side only).
* **Git commits:** Use clear prefixes (e.g., `feat: glassmeet supabase auth setup`, `fix: resolve jsx style bleed`).
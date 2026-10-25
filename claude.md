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

### UI Design System & Styling (Active - Calendly layout, GlassMeet brand, light + dark)

* **Goal:** Calendly's layout and components in the GlassMeet brand (teal `#66ACA9`, slate `#344248`). The theme follows the OS (next-themes `defaultTheme="system"`); light and dark must both be checked for every change.
* **Brand assets:** `src/assets/brand/mark.png` and `wordmark-text.png` are alpha masks from the brand kit, rendered by `Logo` / `LogoMark` in `src/Components/logo.jsx` (mark tinted `bg-brand-teal`, lettering follows `bg-foreground`). Favicons live in `public/`. Never redraw the mark.
* **Stack:** Tailwind CSS v4 (CSS-first config in `src/Index.css`, `@tailwindcss/vite` plugin; there is no `tailwind.config.js`). shadcn/ui components live in `src/Components/ui/` (aliased as `@/components/ui`), restyled to this guide; add more with `npx shadcn@latest add <name>` and restyle them to match.
* **Palette (tokens in `src/Index.css`, `:root` = light, `.dark` = dark — use the token classes, never raw hex):**
  * Page `bg-background` (#f6f9f9 / #0f1516); cards and panels `bg-card` (#ffffff / #162022) with `shadow-card`
  * Soft fills and hover `bg-secondary`; form fields `bg-field` with `border-input`
  * Borders `border-border`, `hover:border-border-hover`
  * Text: `text-foreground` (brand slate #344248 / #e6eeee), `text-muted-foreground` (#55686d / #a0b4b4), `text-hint`
  * Primary `bg-primary text-primary-foreground` (deep teal #2b7a75 with white text / brand teal #66aca9 with slate text) for primary buttons; `bg-primary-soft` + `text-link` for selected/active states (nav item, tabs, available days); `text-link` for all coloured text and links
  * Brand `bg-brand-teal` / `text-brand-slate` for the logo, the landing CTA band and decoration only — brand teal is too light for text or white-text buttons on white
  * Status: `text-success`, `text-warning`, `text-destructive`
* **Typography:** System sans-serif stack (`-apple-system`, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif), antialiased. Headings bold, navy. Labels are sentence case, `text-sm font-semibold` (no uppercase tracked labels, no eyebrows above headings).
* **Geometry:** Buttons and pills `rounded-full`; inputs `rounded-lg` (8px); cards `rounded-xl` (12px) with a 1px border and `shadow-card`.
* **Layout:** App pages use `PageHeader` (title, actions, optional underline `Tabs`) from `src/Components/glass.jsx`. The shell is a flush left sidebar with an outline "+ Create" pill and a top bar (search, notifications, avatar).
* **States:** All transitions `transition-all duration-200`. Keyboard focus is a 2px blue ring (`--ring`).
* **Booking page:** Calendly's card: details left, circle month grid centre, time slots right; a picked slot splits into time + Next. The event's own colour (`--ev`) drives selection there.
* **Accent color:** Users may pick a personal accent in Settings; it sets `--accent-color` (HSL) for small dots only — never for active states.
* **Components:** Prefer the shadcn components (`Button`, `Card`, `Input`, `Dialog`, `Switch`, ...) and the wrappers in `src/Components/glass.jsx` (`GlassCard`, `GlassButton`, `PageHeader`, `Tabs`, `Avatar`, ...). Event types render with `src/Components/eventcard.jsx`. The `glass-*` class names are legacy aliases for the Calendly surfaces.



###  Swift & iOS Rules ( STANDBY MODE - Active only when requested)

* **Syntax:** Use Swift 5+ modern syntax, favoring value types (`struct`) over reference types (`class`) for data models.
* **Architecture:** Utilize SwiftUI for the user interface and the MVVM or Composable Architecture patterns.
* **Data Mapping:** Enforce strict typing. All models must easily map to the Supabase database schema utilizing the native Supabase Swift SDK.

---

##  Security & Git

* **Environment variables:** Never hardcode secrets. Use `.env` for `SUPABASE_URL`, `SUPABASE_ANON_KEY`, and `SUPABASE_SERVICE_ROLE_KEY` (server-side only).
* **Git commits:** Use clear prefixes (e.g., `feat: glassmeet supabase auth setup`, `fix: resolve jsx style bleed`).
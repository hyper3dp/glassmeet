# GlassMeet

GlassMeet is a React scheduling app hosted as a static site on GitHub Pages. Supabase provides authentication, shared records, and a secure Edge Function for Google Calendar access.

## Local development

1. Create a Supabase project.
2. Copy `.env.example` to `.env` and set `VITE_SUPABASE_URL` and `VITE_SUPABASE_ANON_KEY` from the Supabase project's API settings.
3. Apply `supabase/migrations/20260927000000_initial.sql` in the Supabase SQL Editor.
4. Enable Google as an Auth provider and enable manual identity linking in Supabase, then add the Supabase callback URL shown there to the Google OAuth web client.
5. Set the Google OAuth client ID, client secret, and a random `GOOGLE_TOKEN_ENCRYPTION_KEY` as Supabase Edge Function secrets.
6. Deploy `supabase/functions/google-calendar` to the project.
7. Run `npm install` and `npm run dev`.

The Google client JSON in `authgoogle/` is for local reference only; that folder is gitignored. Do not commit the client secret. Supabase Auth and the Edge Function use the client credentials configured in Supabase.

## GitHub Pages deployment

The `Deploy GlassMeet to GitHub Pages` workflow builds and publishes the static app on pushes to `main`. In repository Settings, set Pages to **GitHub Actions**, and add:

- Repository variable `VITE_SUPABASE_URL`
- Repository secret `VITE_SUPABASE_ANON_KEY`

The public anon key is intended for browser use; database row-level security is what protects records. Never add the Supabase service-role key, Google client secret, or Google token encryption key to Pages build variables.

To deploy the Edge Function from the `Deploy Supabase backend` workflow, configure these GitHub repository values:

- Variable `SUPABASE_PROJECT_REF`
- Secrets `SUPABASE_ACCESS_TOKEN`, `SUPABASE_DB_PASSWORD`, `GOOGLE_CLIENT_ID`, `GOOGLE_CLIENT_SECRET`, `GOOGLE_TOKEN_ENCRYPTION_KEY`

Then run the workflow manually from the Actions tab. It applies the database migration, sets server-side Google secrets, and deploys the Edge Function.

## Google OAuth

In Google Cloud Console, enable the Google Calendar API. Add `https://glassmeet.is-a.dev` and `http://localhost:5173` as authorized JavaScript origins, and add the Supabase Auth callback URL as an authorized redirect URI. In Supabase Auth settings, set the site URL to `https://glassmeet.is-a.dev` and allow these redirects:

- `https://glassmeet.is-a.dev/**`
- `https://hyper3dp.github.io/glassmeet/**`
- `http://localhost:5173/**`

The app uses the Google Calendar token only in the Edge Function. It stores refresh tokens encrypted in `google_credentials`, a table with row-level security enabled and no browser access.

## Domain

The Pages build includes `public/CNAME` for `glassmeet.is-a.dev`. The domain must be registered in the is-a.dev registry, and its DNS record must point to `hyper3dp.github.io`. GitHub Pages must also have the custom domain enabled and verified. The CNAME file alone does not register or configure DNS for the domain.

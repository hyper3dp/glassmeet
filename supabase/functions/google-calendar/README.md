# google-calendar edge function

Connects a host's Google Calendar to GlassMeet:

- **Busy times**: booking pages hide slots where the host is busy in Google (their chosen calendar + primary).
- **Bookings to Google**: new confirmed bookings are added to the chosen calendar (auto-sync), and "Sync now" creates, updates and removes events for upcoming bookings.

Tokens are stored in `public.google_tokens`, which only the service role can read. Hosts see their own `public.google_accounts` row.

## 1. Google Cloud console

Use the same project and OAuth client that Supabase Auth's "Sign in with Google" already uses (Supabase dashboard > Authentication > Providers > Google shows its client ID).

1. **Enable the API**: APIs & Services > Library > "Google Calendar API" > Enable.
2. **Redirect URI**: APIs & Services > Credentials > your OAuth 2.0 Client (Web application) > Authorized redirect URIs > add exactly:
   ```
   https://sjxraemrdpzleipfmwun.supabase.co/functions/v1/google-calendar/callback
   ```
   Keep the existing `.../auth/v1/callback` entry for sign-in.
3. **Scopes**: Google Auth Platform (OAuth consent screen) > Data access > Add or remove scopes, add:
   - `https://www.googleapis.com/auth/calendar.events`
   - `https://www.googleapis.com/auth/calendar.readonly`
4. **Test users / verification**: both scopes are *sensitive*.
   - While the app's publishing status is **Testing**, only the listed test users (Audience > Test users, up to 100) can connect, and **Google expires their refresh tokens after 7 days**, so they'll need to reconnect weekly.
   - For launch, set the publishing status to **In production**. Until Google verifies the app (submit for verification: privacy policy URL, app homepage, a short demo video of the calendar use), users see an "unverified app" warning they can click through, with a cap of 100 users.

## 2. Secrets

```sh
supabase secrets set --project-ref sjxraemrdpzleipfmwun \
  GOOGLE_CLIENT_ID="<client id>.apps.googleusercontent.com" \
  GOOGLE_CLIENT_SECRET="<client secret>" \
  APP_URL="https://hyper3dp.github.io/glassmeet"
```

`SUPABASE_URL`, `SUPABASE_ANON_KEY` and `SUPABASE_SERVICE_ROLE_KEY` are provided automatically. Without the Google secrets the function answers `not_configured`, and the app shows "Google Calendar isn't available yet".

The OAuth `state` is signed with a key derived from `GOOGLE_CLIENT_SECRET`. Rotating the secret only invalidates sign-ins that are in progress.

## 3. Database

Apply `supabase/migrations/20261029100000_google_calendar.sql` (adds `google_accounts`, `google_tokens` and three `google_*` columns on `bookings`):

```sh
supabase db push --project-ref sjxraemrdpzleipfmwun
```

or paste the file into the SQL editor. It is safe to run more than once.

## 4. Deploy

```sh
supabase functions deploy google-calendar --no-verify-jwt --project-ref sjxraemrdpzleipfmwun
```

`--no-verify-jwt` is required. Google's redirect to `/callback` is a plain browser request, and `freeBusy` / `pushBooking` are called by guests, who aren't signed in. Host actions check the session inside the function.

## How the connection works

1. The host clicks **Connect Google Calendar**. The app calls `authUrl` and goes to Google's consent page.
2. Google redirects to `/callback`. The function checks the signed `state` (10-minute expiry) and sends the browser back to `APP_URL/calendar-connections?google=finish&code=...&state=...`.
3. The page, signed in as the host, calls `finish`. The function checks that the state belongs to this signed-in user, exchanges the code, stores the tokens and creates the `google_accounts` row. Finishing in the app ties the connection to the host's own session, so nobody can attach their Google account to someone else's GlassMeet with a consent link.

## Actions (POST JSON `{ action, ... }`)

| action | who | does |
| --- | --- | --- |
| `authUrl` `{ returnTo? }` | host | Google consent URL |
| `finish` `{ code, state }` | host | completes the connection |
| `listCalendars` | host | calendars the host can write to (`primary` for the primary one) |
| `saveSettings` `{ calendarId?, autoSync? }` | host | validates the calendar, saves |
| `sync` | host | upcoming bookings to Google: create, update if changed, delete if cancelled |
| `disconnect` | host | revokes at Google, deletes the rows (events already in Google stay) |
| `freeBusy` `{ hostId, timeMin, timeMax }` | anyone | `[{ start, end }]`, window of 62 days at most, `[]` if not connected |
| `pushBooking` `{ bookingId }` | anyone / host | guests: only a confirmed+approved booking made in the last 10 minutes and not yet copied; the host: any of their bookings (after approve / cancel / decline). Needs auto-sync on |

Each booking's Google event id is derived from the booking id (`gm<uuid hex>`), so re-sending a booking never creates a duplicate, and the function never touches events it didn't create.

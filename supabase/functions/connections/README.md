# connections edge function

**Zoom is switched off for now.** The app shows no Zoom card, and this function's Zoom code stays idle while `ZOOM_CLIENT_ID` and `ZOOM_CLIENT_SECRET` aren't set. To bring it back, restore the card on the Calendars page, then follow step 1 below.

Connects a host's Zoom and Microsoft accounts to GlassMeet:

- **Zoom**: an event whose location is Zoom, with no link typed in, gets a new Zoom meeting for each booking.
- **Outlook**: booking pages hide times the host is busy in Outlook, and bookings are copied to their Outlook calendar.
- **Teams**: an event whose location is Microsoft Teams, with no link typed in, gets a Teams meeting for each booking. This needs a work or school account; personal Outlook.com accounts connect for the calendar only.

Google Meet doesn't use this function. It comes from the Google connection (`google-calendar`).

A group session shares one meeting among its guests. Each provider shows as "Coming soon" on the Calendars page until its secrets are set.

## 1. Zoom app

1. At [marketplace.zoom.us](https://marketplace.zoom.us/), choose Develop > Build App > **General App**, managed **user** level.
2. Set both the OAuth Redirect URL and the OAuth allow list to:
   ```
   https://sjxraemrdpzleipfmwun.supabase.co/functions/v1/connections/callback
   ```
3. Under Scopes add `user:read:user`, `meeting:write:meeting` and `meeting:update:meeting`, `meeting:delete:meeting`.
4. Copy the Client ID and Client Secret.

Until the app passes Zoom's review, only accounts you add to it can connect.

## 2. Microsoft app

1. In the [Azure portal](https://portal.azure.com/), open Microsoft Entra ID > App registrations > **New registration**.
2. Under supported account types choose **any organizational directory and personal Microsoft accounts**.
3. Add a **Web** redirect URI:
   ```
   https://sjxraemrdpzleipfmwun.supabase.co/functions/v1/connections/callback
   ```
4. Under API permissions add Microsoft Graph **delegated** permissions: `User.Read`, `Calendars.ReadWrite`, `offline_access`, `openid`, `email`.
5. Under Certificates & secrets create a client secret and copy its **Value**. It expires, so note the date: connecting and syncing stop until you replace it.
6. Copy the Application (client) ID from the Overview page.

Some work and school organizations require an admin to approve new apps. Until the app is publisher verified, Microsoft shows people an "unverified" label, and those organizations may block it.

## 3. Secrets

```sh
supabase secrets set --project-ref sjxraemrdpzleipfmwun \
  ZOOM_CLIENT_ID="<id>" ZOOM_CLIENT_SECRET="<secret>" \
  MS_CLIENT_ID="<id>" MS_CLIENT_SECRET="<secret value>"
```

Set either pair on its own to offer only that provider.

## 4. Database and deploy

Run `supabase/migrations/20261107120000_day_limit_connections.sql`, then:

```sh
supabase functions deploy connections --no-verify-jwt --project-ref sjxraemrdpzleipfmwun
```

`--no-verify-jwt` is required. The provider's redirect to `/callback` is a plain browser request, and `freeBusy` / `pushBooking` are called by guests. Host actions check the session inside the function.

## Actions (POST JSON `{ action, ... }`)

| action | who | does |
| --- | --- | --- |
| `available` | anyone | `{ zoom, microsoft }`: which have their secrets set |
| `authUrl` `{ provider, returnTo? }` | host | the provider's consent URL |
| `finish` `{ code, state }` | host | completes the connection |
| `saveSettings` `{ provider, autoSync }` | host | new bookings copied to Outlook or not |
| `sync` `{ provider }` | host | upcoming bookings: create, update if changed, remove if cancelled |
| `disconnect` `{ provider }` | host | deletes the rows; meetings and events already made stay |
| `freeBusy` `{ hostId, timeMin, timeMax }` | anyone | Outlook `[{ start, end }]`, a window of 62 days at most |
| `pushBooking` `{ bookingId }` | anyone / host | guests: only a confirmed, approved booking made in the last 10 minutes; the host: any of theirs |

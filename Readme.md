# GlassMeet

GlassMeet is a standalone scheduling app. The frontend and local API run in one Node process; account and booking data are stored in SQLite at `data/glassmeet.sqlite`.

## Requirements

- Node.js 22.12 or newer
- npm

## Run

```bash
npm install
npm run dev
```

Open `http://localhost:5173`, create a local account, and manage bookings. The SQLite file is created automatically on first start.

For a production build, run `npm run build` and then `npm start`.

## Google Accounts and Calendar

1. Enable the Google Calendar API and configure the OAuth web client in Google Cloud Console.
2. Add `http://localhost:5173` as an authorized JavaScript origin and `http://localhost:5173/api/auth/google/callback` as an authorized redirect URI. The client JSON must belong to a web application OAuth client.
3. Put the downloaded client JSON in `authgoogle/`. That folder is gitignored; do not commit or upload the JSON file.
4. Restart `npm run dev`. The server reads the local client ID and secret from that folder. Confirmed bookings are created in the selected Google calendar.

For production, point `glassmeet.com` DNS at your hosting provider, enable HTTPS, and add `https://glassmeet.com` plus `https://glassmeet.com/api/auth/google/callback` to the Google OAuth client. Set `APP_PUBLIC_URL` and `GOOGLE_REDIRECT_URI` to those HTTPS URLs in the production environment. DNS and hosting cannot be configured from this source tree; do not expose the local development server directly to the public internet.

Google refresh tokens are encrypted in the local SQLite database. Locally, the encryption key is derived from the private OAuth client secret; Render uses its generated `GOOGLE_TOKEN_ENCRYPTION_KEY`. Email delivery and WhatsApp messages still require their own provider credentials; local password-reset links are displayed in the browser.

## Deploy with GitHub and Render

GitHub stores the source; Render runs the Node server and persistent SQLite disk. GitHub Pages alone cannot run this app's API or database.

1. Create a GitHub repository and push this project to its default branch.
2. In Render, choose **New + → Blueprint**, connect the GitHub repository, and deploy the included `render.yaml`.
3. Enter the client ID and secret from the local `authgoogle/` JSON into Render's secret fields when prompted. The blueprint generates the encryption key. Never upload the JSON file to GitHub or Render.
4. In Render, add `glassmeet.com` and `www.glassmeet.com` as custom domains and follow the DNS records it shows.
5. At the current domain DNS provider, replace the existing Gname parking record with Render's requested apex and `www` records. Keep DNS-only changes; do not point the domain at this computer.
6. In Google Cloud Console, add `https://glassmeet.com` as an authorized JavaScript origin and `https://glassmeet.com/api/auth/google/callback` as an authorized redirect URI.

The server redirects `www.glassmeet.com` to `https://glassmeet.com`. A persistent Render disk is required because SQLite stores account, booking, and encrypted Google token data.

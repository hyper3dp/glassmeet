# booking-email edge function

Emails the host over SMTP whenever someone books them, with the time (in the host's time zone), the guest's details, their notes and answers, and a button to the meeting in GlassMeet. Bookings that need approval say so and link to the request. Replying to the email goes to the guest, when they gave an email.

## How it fires

The trigger `bookings_email_host` (migration `20261102120000_booking_emails.sql`) posts `{ booking_id }` to this function after every new booking, using `pg_net`, so the booking never waits on the email. The function:

- only acts on a booking made in the last 15 minutes that isn't cancelled,
- claims it in `public.booking_emails` first, so a booking is emailed at most once,
- sends to that booking's own host (their sign-in email), never to an address from the request.

If sending fails, the claim is removed and the SMTP error is logged (Edge Functions > booking-email > Logs).

## 1. Secrets

Use any SMTP provider (the same one as Supabase Auth's custom SMTP works). **Use port 465.** Supabase blocks outbound ports 25 and 587 from Edge Functions.

```sh
supabase secrets set --project-ref sjxraemrdpzleipfmwun \
  SMTP_HOST="smtp.example.com" \
  SMTP_PORT="465" \
  SMTP_USER="<smtp username>" \
  SMTP_PASS="<smtp password>" \
  SMTP_FROM="GlassMeet <bookings@your-domain.com>" \
  APP_URL="https://hyper3dp.github.io/glassmeet"
```

Without the SMTP secrets the function answers `not_configured` and no email is sent; bookings work as usual.

## 2. Database

Paste `supabase/migrations/20261102120000_booking_emails.sql` into the SQL editor and run it. It is safe to run more than once.

## 3. Deploy

```sh
supabase functions deploy booking-email --no-verify-jwt --project-ref sjxraemrdpzleipfmwun
```

`--no-verify-jwt` is required: the database trigger calls it without a user session.

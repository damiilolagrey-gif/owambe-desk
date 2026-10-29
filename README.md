# Owambe Desk

One place for an event planner, their vendors and the client. Planners pay vendors through Paystack straight into
each vendor's verified bank account, every payment gets a receipt in the event chat, and the client can follow
balances and approve budget changes.

## Stack

- Next.js (App Router) on Vercel
- Supabase: Postgres with row level security, email sign-in, live chat
- Paystack: bank account checks, subaccounts, split payments into vendor accounts
- Optional WhatsApp Business Cloud API alerts

## How payments work

1. A vendor adds bank details. The server checks the account name with Paystack and creates a Paystack subaccount.
2. The planner pays a milestone. Paystack collects amount + Paystack fee and settles the amount to the vendor's
   subaccount (usually next business day). The platform never holds the money.
3. Paystack's webhook (or the return page) confirms the payment. The milestone is marked paid and a receipt is
   posted in the chat.

Privileged database writes go through `server_*` SQL functions that check `SERVER_SECRET`, so the app does not need
the Supabase service role key.

## Setup

1. Run the SQL in `supabase/migrations` in order.
2. Set the server secret in the database:
   `insert into private.settings values ('server_secret', '<random value>');`
3. Copy `.env.example` to `.env.local` and fill it in (`SERVER_SECRET` must match step 2).
4. In Supabase > Authentication > URL configuration, set the Site URL to your domain and add
   `https://<your-domain>/auth/callback` to the redirect URLs.
5. In Paystack > Settings > API Keys & Webhooks, set the webhook URL to `https://<your-domain>/api/paystack/webhook`.
6. `npm install && npm run dev`

## Not built yet

- Optional escrow ("hold until delivered"), planned for phase 2 with a licensed partner
- Planner monthly subscriptions
- Phone number sign-in (email links for now)

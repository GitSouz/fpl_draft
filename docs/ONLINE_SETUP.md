# Online (multiplayer) setup

By default the app runs **local-only** (one machine, one screen). To let all 10
managers draft live from their own devices, you connect it to a free **Supabase**
project and deploy it (free) to **Vercel**. Total cost: **$0**.

There are two parts: **the database (Supabase)** and **the hosting (Vercel)**.
Budget ~20–30 minutes the first time.

---

## Part 1 — Supabase (database + realtime)

1. Go to <https://supabase.com>, sign up (no card needed), and **New project**.
   Pick any name, set a database password (you won't need it again for this),
   choose the region closest to your league, and create it. Wait ~2 minutes for
   it to provision.

2. In the project, open the **SQL Editor** → **New query**. Open
   [`supabase/migrations/0001_init.sql`](../supabase/migrations/0001_init.sql)
   from this repo, paste the **entire file** in, and click **Run**. You should
   see "Success". This creates all the tables, security rules, and draft logic.

3. Open **Project Settings → API** and copy two values:
   - **Project URL** (looks like `https://abcdefgh.supabase.co`)
   - **anon public** key (a long token — this one is safe to ship in a browser app)

That's the backend done.

> **Free-tier note:** Supabase pauses inactive projects after ~1 week. If your
> draft is weeks away, just open the Supabase dashboard and **Restore/Resume**
> the project a few minutes before draft night — it wakes up in under a minute.

---

## Part 2 — Deploy to Vercel (hosting)

You can test locally first (see the bottom section), but to give everyone a URL:

1. Push this repo to your own GitHub (it already is if you're reading this
   there). Go to <https://vercel.com>, sign up with GitHub (no card needed).

2. **Add New → Project**, import this repository. Vercel auto-detects Vite —
   leave the build settings as they are.

3. Before deploying, expand **Environment Variables** and add the two from
   Supabase:

   | Name | Value |
   |------|-------|
   | `VITE_SUPABASE_URL` | your Project URL |
   | `VITE_SUPABASE_ANON_KEY` | your anon public key |

4. Click **Deploy**. In ~1 minute you get a URL like
   `https://your-draft.vercel.app`. That's the link you share with your league.

Done. Opening that URL now shows a **Local / Online** choice, and Online works.

---

## How a live draft runs

1. **Host:** open the site → **Online** → **Create a draft**. Load the live FPL
   players (or sample data), enter all 10 managers in draft order, pick a clock,
   and **Create**. You'll get a **room code**.
2. **Everyone:** open the same URL → **Online** → **Join**, enter the code, and
   **Claim** their seat (their name in the order).
3. **Host:** once everyone's claimed, hit **Start draft**.
4. The person **on the clock** picks; everyone else's board updates instantly.
   If someone's away, the clock auto-picks best-available for them (or the host
   can **Force pick**). The host can also **Undo**.
5. Export the finished squads to **CSV** any time.

Your seat is remembered on your device, so a refresh drops you straight back in.

---

## Running online mode locally (optional, for testing)

You don't need Vercel to try it — just add the Supabase keys locally:

```bash
cp .env.example .env
# edit .env and paste your VITE_SUPABASE_URL and VITE_SUPABASE_ANON_KEY
npm run dev
```

Open the printed URL in two browser windows (or your phone on the same Wi‑Fi via
the Network URL) to simulate two managers.

---

## Troubleshooting

- **"Online" option doesn't appear** → the Supabase env vars aren't set. Check
  `.env` locally, or the Vercel project's Environment Variables (then redeploy).
- **Can't load live players when creating** → the FPL API may be updating
  (between seasons), or the serverless proxy's request was blocked. Use **sample
  data** to proceed; live data returns once FPL is back online.
- **Picks not syncing** → make sure step 2's SQL ran fully (it enables realtime
  on the tables at the very end).

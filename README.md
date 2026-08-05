# WINGO — Multiplayer Web Game

A free, real-time multiplayer implementation of the WINGO game (Tambola-style,
with ascending-order column rules, wild numbers, and bonus scoring).

**Stack (100% free tier for a small group of players):**
- **Next.js** (React) — frontend + API routes, hosted free on **Vercel**
- **Supabase** — free Postgres database, authentication, and realtime updates

No server to manage, no credit card required for this scale (<50 players).

---

## 1. Create your Supabase project (free)

1. Go to https://supabase.com → **Start your project** → sign in with GitHub.
2. Click **New Project**. Pick any name (e.g. `wingo`), set a database
   password (save it somewhere), pick the region closest to your players.
3. Wait ~2 minutes for it to provision.
4. In the left sidebar, go to **SQL Editor** → **New query**.
5. Open `supabase/schema.sql` from this codebase, copy its entire contents,
   paste into the SQL editor, and click **Run**. This creates all tables,
   security policies, and enables realtime.
6. Go to **Project Settings → API**. You'll need three values from here in
   step 3 below:
   - `Project URL`
   - `anon public` key
   - `service_role` key (click "Reveal" — keep this one secret!)
7. Go to **Authentication → Providers** and confirm **Email** is enabled
   (it is by default). Go to **Authentication → Settings** and, for a quick
   private-group setup, you can **turn off "Confirm email"** so players can
   sign up and play immediately without clicking a verification email.

---

## 2. Get the code running locally (optional but recommended first)

You'll need [Node.js](https://nodejs.org) 18+ installed.

```bash
# unzip the project, then:
cd wingo
npm install
cp .env.example .env.local
```

Open `.env.local` and paste in the three Supabase values from step 1.6:

```
NEXT_PUBLIC_SUPABASE_URL=https://your-project.supabase.co
NEXT_PUBLIC_SUPABASE_ANON_KEY=your-anon-public-key
SUPABASE_SERVICE_ROLE_KEY=your-service-role-key
```

Then run:

```bash
npm run dev
```

Visit http://localhost:3000 — you should see the WINGO login screen.

---

## 3. Create your admin account

1. On the login screen, click **"Don't have an account? Sign up"**.
2. Sign up with your own email + a password + your display name.
3. By default every new signup is a `player`. To make yourself `admin`, go
   back to Supabase → **SQL Editor** → **New query** and run:

   ```sql
   update public.profiles set role = 'admin'
     where id = (select id from auth.users where email = 'YOUR_EMAIL_HERE');
   ```

   (Replace `YOUR_EMAIL_HERE` with the email you signed up with.)
4. Refresh the app and go to `http://localhost:3000/admin` — you should now
   see the admin dashboard instead of "not an admin".

---

## 4. Deploy for free on Vercel (so players can join from anywhere)

1. Push this codebase to a new GitHub repository:

   ```bash
   cd wingo
   git init
   git add .
   git commit -m "Initial WINGO game"
   git branch -M main
   git remote add origin https://github.com/YOUR_USERNAME/wingo.git
   git push -u origin main
   ```

2. Go to https://vercel.com → sign in with GitHub → **Add New Project** →
   import your `wingo` repo.
3. In the **Environment Variables** section during setup, add the same three
   variables from your `.env.local`:
   - `NEXT_PUBLIC_SUPABASE_URL`
   - `NEXT_PUBLIC_SUPABASE_ANON_KEY`
   - `SUPABASE_SERVICE_ROLE_KEY`
4. Click **Deploy**. In ~1-2 minutes you'll get a live URL like
   `https://wingo-yourname.vercel.app`.
5. Share `https://wingo-yourname.vercel.app/login` with your players. They
   sign up (becomes a `player` automatically), then land on `/play`.
6. You (the admin) go to `https://wingo-yourname.vercel.app/admin` to
   create a game and start drawing numbers.

---

## 5. How to run a game

**As admin** (`/admin`):
1. Click **Create New Game**.
2. Share the `/play` link with your players — they sign up/log in and land
   there automatically, waiting for the first draw.
3. Click **Draw Next Number** whenever you're ready to reveal the next
   number+symbol (do this at whatever pace suits your group — e.g. every
   30-60 seconds). All connected players see it appear instantly.
4. Watch the live leaderboard update as players place numbers.
5. Click **End Game** whenever you want to stop (or it auto-ends once all
   90 numbers are drawn).

**As a player** (`/play`):
1. Sign up / log in.
2. When a number is drawn, it appears as a button under "Numbers to place".
3. Click it — valid empty cells light up green on your ticket.
4. Click a highlighted cell to place it there.
5. If you don't click a valid cell (or none exist for that column), the
   number is simply skipped, matching real Tambola/Housie play.

---

## Game rules implemented

- 5 columns (symbols), 15 rows, arranged in 3 blocks of 5 rows.
- Numbers 1-90, each column restricted to its own numeric band
  (1-18, 19-36, 37-54, 55-72, 73-90), matching the drawn symbol's column.
- **~10% of draws are "wild"** — can be placed in *any* column.
- **Ascending-order rule**: within any column, numbers must read top-to-
  bottom in increasing order. The server rejects any placement that would
  violate this — enforced both client-side (only valid cells are
  clickable) and server-side (API re-validates every placement).
- **Scoring** (calculated live after every placement):
  - 10 pts per number placed
  - 150 pts per fully completed column
  - 200 pts per fully completed block (5x5)
  - 150 pts if the first or last row (marked ODD/EVEN) is fully populated
    with all-odd or all-even numbers
  - 250 pts per middle row (marked ASCENDING) if its 5 numbers read
    left-to-right in increasing order

You can tune the row layout, wild-number odds, or scoring values directly
in `lib/gameRules.js`.

---

## Project structure

```
app/
  page.js              → redirects to /login or /play
  login/page.js         → sign up / sign in
  play/page.js           → player game screen (realtime)
  admin/page.js           → admin dashboard (create game, draw numbers)
  api/game/route.js       → POST: admin creates a new game
  api/draw/route.js       → POST: admin draws the next number
  api/place/route.js      → POST: player places a number (server-validated)
components/
  TicketGrid.js          → the 15x5 grid UI, reused by admin & player views
lib/
  gameRules.js           → all game logic: columns, ascending rule, scoring
  supabaseClient.js       → browser Supabase client
  supabaseServerAuth.js   → server Supabase client (reads user session)
  supabaseAdmin.js        → server-only client using the service role key
supabase/
  schema.sql             → run this once in Supabase's SQL editor
```

---

## Costs

- Supabase free tier: 500MB database, 50,000 monthly active users,
  unlimited API requests, realtime included — far more than a <50-player
  group needs.
- Vercel free (Hobby) tier: generous bandwidth/build limits for personal
  projects, no cost for this traffic level.

If your game ever grows beyond casual/private use, check both platforms'
current pricing pages, as free tier limits can change.

---

## Troubleshooting

- **"Not authorized" on /admin`**: you haven't run the SQL `update`
  statement to promote your account to `role = 'admin'` yet (Step 3).
- **Nothing updates live**: double check step 1.5 ran successfully — it
  includes the `alter publication supabase_realtime add table ...` lines
  that turn on realtime.
- **Sign-up requires email confirmation**: turn off "Confirm email" in
  Supabase → Authentication → Settings (Step 1.7), or have players check
  their inbox for the confirmation link.
- **Env vars not working on Vercel**: after adding/editing them in Vercel's
  dashboard, you must trigger a redeploy (Vercel → Deployments → ⋯ →
  Redeploy) for changes to take effect.

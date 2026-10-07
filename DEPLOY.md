# Deploying COMPETE

Follow these in order. Roughly 45 minutes end to end, most of it waiting.

Accounts needed: **GitHub** (done), **Supabase** (done), **Vercel**, and
later **Google Cloud** and **Resend**. There is deliberately no Mapbox
account — see the note at the bottom of `.env.example`.

---

## 1. Create the Supabase project

Dashboard → **New project**.

| Field | Value |
|---|---|
| Name | `compete` |
| Database password | **Generate a strong one and save it immediately** |
| Region | East US (Ohio) or East US (N. Virginia) — closest to Missouri |
| Plan | Free |

**Supabase shows the database password once and cannot recover it, only
reset it.** Put it in a password manager before clicking create.

Provisioning takes about two minutes.

> **Free-tier gotcha:** Supabase pauses a free project after **one week of
> inactivity**. A live site with traffic never hits this, but the quiet
> stretch between finishing setup and launching will. If the site starts
> throwing database errors after a quiet week, nothing is broken — click
> Restore in the dashboard.

---

## 2. Run the migrations, in order

Left sidebar → **SQL Editor** → **New query**. For each file in
`supabase/`, paste the whole contents, press **Run**, confirm success, then
move to the next. Order matters — later files have foreign keys into
earlier ones.

| # | File | What it creates |
|---|---|---|
| 1 | `001_schema.sql` | Sports, surfaces, formats, divisions, venues, organizers, events, `miles_between()` |
| 2 | `002_featured.sql` | No-op on a fresh database. Run it anyway so history matches what is deployed |
| 3 | `003_accounts.sql` | Accounts, sessions, profiles, saved events, SMS consent log, RLS |
| 4 | `004_brackets.sql` | Tom's taxonomy, `event_brackets`, check-in/meeting times, early-bird pricing |
| 5 | `005_age_audit.sql` | The append-only age-gate audit log |

---

## 3. Get the connection string

Top of the page → **Connect** → the **Direct** tab (labelled "Connection
string") → Connection Method **Transaction pooler** → Type **URI**.

The tab named "Direct" is the connection-string tab; the *method* inside it
is what has to be Transaction pooler. Not "Direct connection", not "Session
pooler". **Port must be 6543** — the driver is configured for the
transaction pooler and the direct connection will not survive serverless
traffic.

Replace `[YOUR-PASSWORD]`, append `?sslmode=require`, and keep it to hand.

Two things that look alarming on that screen and are not:

- **"Transaction pooler uses IPv6 by default — enable the IPv4 add-on."**
  Not needed. The shared pooler host resolves to IPv4 as well
  (`aws-0-us-east-2.pooler.supabase.com` → three A records, checked 6 Oct
  2026), so Vercel reaches it without the paid add-on.
- **"Database access requires the Data API"**, on the Framework tab. Also
  not needed, and should stay off. That API exists for the Supabase client
  library, which this app does not use. Leaving it disabled removes a
  public surface rather than breaking anything.

**If the database password contains any of** `@ : / ? # [ ] % & + space`,
percent-encode it inside the URI or the string will be parsed wrongly —
`@` becomes `%40`, `#` becomes `%23`, `%` becomes `%25`, and so on. The
symptom is a confusing authentication or host error, not a clear one.

You will **not** need Supabase's `anon` or `service_role` API keys. This app
talks to plain Postgres and uses neither. If any tutorial tells you to paste
a `service_role` key into frontend code, that is a full-database-access key
and the answer is no.

---

## 4. Seed the database from your laptop

```bash
npm install
```

Create `.env.local` (copy `.env.example` and fill it in). The minimum to get
going is `DATABASE_URL`, `ADMIN_PASSWORD` and `SESSION_SECRET`. Generate the
two secrets:

```bash
openssl rand -base64 32
```

Then:

```bash
npm run data:prepare    # builds geography lookups
npm run db:seed         # writes sports, formats, venues, events
npm run data:history    # parses the 2022-24 sheets + organization tracker
npm run db:seed:history # writes 398 archived events and 295 organizations
```

Check it worked before involving Vercel:

```bash
npm run dev
```

Open `http://localhost:3000`. If events appear, the database half is done
and any later problem is a Vercel configuration problem — a much easier
thing to debug.

Optionally run the tests (`npm test`) — 38 end-to-end and 13 unit. They need
the dev server running.

---

## 5. Push to GitHub

Create a **private** repo named `compete` with no README and no .gitignore
(both already exist here), then:

```bash
git init
git add .
git commit -m "COMPETE: Phase 1 + 2"
git branch -M main
git remote add origin git@github.com:<you>/compete.git
git push -u origin main
```

`.gitignore` already excludes `.env.local`. If a secret ever does get
committed, **rotate it** — deleting the file does not remove it from git
history.

---

## 6. Deploy on Vercel

Sign up **with GitHub**, then **Add New → Project → Import** the repo.
Vercel detects Next.js; leave the build settings alone.

Before clicking Deploy, add these environment variables:

| Name | Value |
|---|---|
| `DATABASE_URL` | the step 3 string, port 6543, with `?sslmode=require` |
| `ADMIN_PASSWORD` | your passphrase |
| `SESSION_SECRET` | your `openssl rand` output |
| `NEXT_PUBLIC_SITE_URL` | `https://joincompete.com` |

Deploy. Two to three minutes.

> **Vercel Hobby is non-commercial only**, per their own fair-use
> guidelines. Deploy there today to see it live; move to **Pro ($20/month)**
> before taking money from an organizer.

---

## 7. Point the domain at it

Project → **Settings → Domains** → add `joincompete.com` and
`www.joincompete.com`. Vercel shows the DNS records; add them at your
registrar. HTTPS is issued automatically once DNS resolves.

Then confirm `NEXT_PUBLIC_SITE_URL` reads `https://joincompete.com` and
**redeploy**, so password-reset and verification links point at the right
host.

---

## 8. Afterwards

**Google Cloud** — one project, two jobs:

*OAuth:* Consent screen (External) needs the home page, `/privacy` and
`/terms` live first, which is why it comes after step 7. Scopes stay at
`openid`, `userinfo.email`, `userinfo.profile` — all non-sensitive, so no
verification review. Then an OAuth client ID with redirect URIs
`https://joincompete.com/api/auth/google/callback` and
`http://localhost:3000/api/auth/google/callback`.

*Maps, for the CRM:* enable **Maps JavaScript API**, **Places API (New)**
and **Geocoding API**, with billing on. Create a browser key restricted by
HTTP referrer to `https://joincompete.com/*` and `http://localhost:3000/*`,
and restricted to those three APIs. Set a budget alert **and** a daily quota
cap — the alert tells you after the fact, the cap actually stops it.

**Resend** — needed sooner than it looks. Without it, password resets and
the age-gate compliance alerts write to the server log instead of sending,
and `/admin/compliance` shows them as "not sent".

---

## Still outstanding before launch

- `LEGAL_ENTITY` and `GOVERNING_STATE` in `src/lib/legal.ts` are
  placeholders reading "COMPETE Sports, LLC" and "Missouri". `/privacy` and
  `/terms` need a lawyer's eyes — and Google's consent screen will link to
  both.
- `hello@joincompete.com` does not exist yet. The footer, every empty state
  and the mail sender all point at it.
- Turn on 2FA for GitHub, Supabase, Vercel and Google, and **save your
  GitHub recovery codes somewhere off your laptop**. GitHub controls what
  gets deployed, so it is the account worth defending properly.

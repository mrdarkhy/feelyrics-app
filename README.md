# Feelyrics

Song lyrics translated into the closest possible **feeling**, not word for word —
with a note on every line explaining the call behind it.

Next.js 16 · React 19 · TypeScript · PostgreSQL (Drizzle) · next-intl (EN/TR/ES) ·
Radix UI · Tailwind 4.

---

## Getting it running

```bash
npm install
cp .env.example .env.local      # then fill in DATABASE_URL
npm run db:migrate              # create the tables
npm run db:seed                 # load the catalogue (66 songs)
npm run dev                     # http://localhost:3000
```

### Environment

| Variable | Required | What it is |
| --- | --- | --- |
| `DATABASE_URL` | yes | PostgreSQL connection string (Neon or Supabase). Must include `?sslmode=require`. |
| `NEXT_PUBLIC_SITE_URL` | yes | Public origin, no trailing slash. Used for canonical URLs, the sitemap and share links. |
| `ADMIN_TOKEN` | for the maintainer area | Long random string. `openssl rand -base64 32`. |
| `NEXT_PUBLIC_REQUEST_FORM_URL` | no | Legacy Google Form, if you still want it linked. |

### Scripts

| Command | What it does |
| --- | --- |
| `npm run dev` | Development server |
| `npm run build` / `npm start` | Production build and serve |
| `npm run verify` | Typecheck, lint and unit tests — run this before pushing |
| `npm test` | Unit tests (Vitest) |
| `npm run test:e2e` | Browser tests (Playwright), against a production build |
| `npm run db:generate` | Write a new migration after editing the schema |
| `npm run db:migrate` | Apply migrations |
| `npm run db:seed` | Load or reload the catalogue (idempotent) |
| `npm run db:studio` | Browse the database in a GUI |

---

## The one rule that shapes everything

Song lyrics are copyrighted, and translating them produces a derivative work.
Feelyrics works from lyrics people paste in themselves, which is defensible for
private reading and stops being so the moment the same text is served from our
own pages to anyone who asks.

So:

- **Public pages show at most two lines of any song**, always beside the
  reasoning that makes them commentary rather than republication.
- **Full translations travel in the fragment of a share link** (`/s#f1.…`).
  Browsers never transmit the part after `#`, so the payload goes from the
  sender's device straight to the reader's, touching no server of ours.
- **Public-domain and licensed lyrics are exempt** and say so on the page.

This is not a UI convention. It lives in
[`src/domain/song/minimal-quote.policy.ts`](src/domain/song/minimal-quote.policy.ts)
as a branded type that only one function can produce, so every public surface is
forced through the cap by the compiler. If someone later writes a page that
renders a raw `Song`, it will not build.

`tests/unit/minimal-quote.policy.test.ts` is the most important test in the
repository. Do not weaken it.

---

## How the code is arranged

```
src/
  domain/          Pure business rules. No React, no Next, no database.
  application/     Use cases, and the port interfaces they depend on.
  infrastructure/  Drizzle repositories, auth, the composition root.
  app/             Routes. Server components fetch, client components interact.
  components/      UI, on Radix primitives.
  i18n/            Locale routing and request config.
messages/          en.json · tr.json · es.json — identical key sets, enforced by a test.
```

Dependencies point inward: `app` → `application` → `domain`. The lint config
enforces it — a domain file that imports React, or an application file that
imports Drizzle, fails `npm run lint`.

The one place an interface is bound to an implementation is
`src/infrastructure/container.ts`. Swapping Postgres for something else is an
edit there and nowhere else.

### Two languages, two jobs

The **interface** speaks English, Turkish or Spanish, whichever the reader chose.
The **content** — feel profiles, section labels, line notes — is written in each
song's *target* language, because the person reading a TR→ES translation is a
Spanish speaker. Both are tagged with `lang` so screen readers switch voice
between the original line and its rendering.

---

## Adding a song

Songs live in the database. The seed file
(`src/infrastructure/db/seed-data.ts`) is a starting point imported from the
pre-database catalogue, not a source of truth.

`scripts/import-legacy.mjs` converts the old `songs.js` plus the studio player's
inline catalogue into that file. It is meant to be run rarely, by hand.

---

## Deploying

The app runs on Vercel with no configuration beyond the three environment
variables. `DEPLOYMENT.md` is the step-by-step version for someone who does not
write code.

## Contributing a better line

Any reader can suggest an alternative rendering of any line, with no account.
Every suggestion must carry at least one reason tag — that is what turns a
correction into a labelled preference pair rather than an opinion, and the
dataset of those pairs is what this project is really building.

Accepted suggestions rewrite the line for everyone who reads it next.

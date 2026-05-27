# SXC — Hyrox Coach Dashboard

An AI-assisted training dashboard for Hyrox coaches: manage athletes, camps,
classes, structured workouts, and per-class performance — with a built-in
AI co-coach for drafting plans and athlete-specific guidance.

**Stack:** Next.js 16 (App Router) · React 19 · Prisma 7 + SQLite · Tailwind 4 · Anthropic SDK.

> **Project phase:** This is currently in a **demo / validation** phase. It runs
> on SQLite with simple cookie auth so the data model and features can be
> confirmed cheaply. Production infrastructure (PostgreSQL, real auth, object
> storage) is intentionally deferred — see [Deploying to the cloud](#deploying-to-the-cloud).

---

## Prerequisites

- **Node.js 20+** (22 works) and npm
- No external database needed for the demo — SQLite lives in a local file.

## Getting started

```bash
# 1. Install dependencies (also generates the Prisma client via postinstall)
npm install

# 2. Create your local environment file
cp .env.example .env
#    then open .env and fill in the AI keys (see "Environment variables" below)

# 3. Create the database schema and load demo data
npm run db:setup

# 4. Start the dev server
npm run dev
```

Open **http://localhost:3000**.

**Demo accounts** (created by the seed):

| Username | Password   | Role  |
| -------- | ---------- | ----- |
| `peter`  | `peter123` | admin |
| `src`    | `src123`   | coach |

## Environment variables

Copy `.env.example` to `.env` and set:

| Variable         | Required    | Description                                                            |
| ---------------- | ----------- | ---------------------------------------------------------------------- |
| `DATABASE_URL`   | yes         | Database connection. Demo default: `file:./dev.db` (SQLite).           |
| `SESSION_SECRET` | yes         | Secret used to sign session cookies. Use a long random string in prod. |
| `AI_API_KEY`     | for AI chat | API key for the model provider (Anthropic-compatible).                 |
| `AI_BASE_URL`    | for AI chat | Base URL of the model provider.                                        |
| `AI_MODEL`       | optional    | Model name (defaults to `deepseek-v4-pro`).                            |

The app runs without the AI keys, but the **AI co-coach chat is disabled** until
`AI_API_KEY` (and usually `AI_BASE_URL`) are set.

## Common scripts

| Command              | What it does                                          |
| -------------------- | ----------------------------------------------------- |
| `npm run dev`        | Start the dev server (Turbopack) on port 3000.        |
| `npm run build`      | Production build.                                     |
| `npm start`          | Run the production build.                             |
| `npm run lint`       | Lint with ESLint.                                     |
| `npm run db:setup`   | Apply migrations + seed demo data (first-time local). |
| `npm run db:migrate` | Apply pending migrations only (no seed).              |
| `npm run db:seed`    | (Re)load demo data.                                   |

## Project structure

```
src/
├─ app/             # Pages (UI) + API routes (backend) — Next.js App Router
│  ├─ (app)/        # Logged-in dashboard: calendar, camps, customers, classes, workouts
│  ├─ api/          # Backend endpoints (chat, workouts, todos, performance, ...)
│  └─ login/        # Login page
├─ agent/           # AI co-coach engine (streaming loop + system prompt)   [backend]
├─ tools/           # Actions the AI can take (e.g. create_todo)            [backend]
├─ domain/          # Business logic: workouts, performance, benchmarks     [backend]
├─ lib/             # DB client, auth, shared queries                       [backend]
└─ components/      # Reusable UI                                           [frontend]
prisma/             # schema.prisma, migrations, seed.ts
```

Backend (`agent`, `tools`, `domain`, `lib`, `app/api`) and frontend
(`components`, `app/*/page.tsx`) share one codebase and one set of types — this
is intentional for a single full-stack Next.js app.

---

## Deploying to the cloud

The architecture (stateless Next.js + Prisma) is cloud-ready; only the
*infrastructure pieces* need to grow with you. Recommended path:

### Demo / early stage (now)
Keep it simple and cheap. Deploy the app as a **single container** to a
platform with a **persistent disk** for the SQLite file:

- **Railway**, **Render**, or **Fly.io** — git-connected, deploy on push, and
  give you a persistent volume mounted where `dev.db` lives.
- Set `DATABASE_URL`, `SESSION_SECRET`, and the `AI_*` vars as platform secrets.
- Run `npm run db:migrate` as the release/start step.

> Note: **Vercel and other serverless platforms have an ephemeral filesystem**,
> so a SQLite file is wiped on every deploy. Use a VM/container with a volume
> while on SQLite, or move to managed Postgres first (below).

### Scaling up (later, pre-launch)
When you're ready for real traffic, change infrastructure — **not the code**:

1. **Database:** point `DATABASE_URL` at a managed **PostgreSQL** (Neon, Supabase,
   RDS) and switch the Prisma datasource provider to `postgresql`. Prisma keeps
   the app code unchanged.
2. **Hosting:** with Postgres you can deploy on **Vercel** (zero-config for
   Next.js) or keep containers behind a load balancer for horizontal scaling.
3. **Auth:** replace the demo cookie auth with a battle-tested library + secret store.
4. **File uploads:** move athlete videos from `/public/uploads` to object
   storage (S3 / Cloudflare R2).

### CI/CD (recommended setup)
Keep the pipeline boring and repeatable. A typical GitHub Actions flow:

1. **On pull request** — install, `npm run lint`, `npx tsc --noEmit`, `npm run build`.
2. **On merge to `main`** — build, then run **`npx prisma migrate deploy`**
   against the target database, then release the new version.

Two rules that keep deploys safe:

- **Always run `prisma migrate deploy` in the pipeline** (never edit the prod DB by hand).
- **Keep all config in environment secrets**, never in the repo.

This way every push is a candidate release, and promoting to production is just
"merge to `main`."

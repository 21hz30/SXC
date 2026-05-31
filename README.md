# SXC — Hyrox Coach Dashboard

An AI-assisted training dashboard for Hyrox coaches: manage athletes, camps,
classes, structured workouts, and per-class performance — with a built-in
AI co-coach for drafting plans and athlete-specific guidance.

**Stack:** Next.js 16 (App Router) · React 19 · Prisma 7 + PostgreSQL (Supabase) · Tailwind 4 · Anthropic SDK.

> **Project phase:** This is currently in a **demo / validation** phase. The
> database is hosted on Supabase; auth is a simple cookie-based scheme that
> covers admin / coach / customer roles. Production hardening (managed auth
> like Auth.js, object storage for video uploads, CI/CD) is intentionally
> deferred — see [Deploying to the cloud](#deploying-to-the-cloud).

---

## Prerequisites

- **Node.js 20+** (22 works) and npm
- A **Supabase** project (free tier is fine). Grab its **session-mode pooler**
  connection string from *Project Settings → Database → Connection string →
  Session*.

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
| `DATABASE_URL`   | yes         | Supabase **session-mode pooler** URL. Format: `postgresql://postgres.<ref>:<password>@aws-1-<region>.pooler.supabase.com:5432/postgres` |
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

The architecture (stateless Next.js + Prisma + Supabase) is cloud-ready out
of the box. Recommended path:

### Now
Database already lives on **Supabase** (managed PostgreSQL). The app server
is stateless, so any host works:

- **Vercel** — zero-config for Next.js. Set `DATABASE_URL`, `SESSION_SECRET`,
  and the `AI_*` vars as platform secrets. Deploy on push.
- **Railway / Render / Fly.io** — same idea, container-based, also fine.
- Run `npm run db:migrate` as the release step.
- **Deploy in the same region as your Supabase project** (currently
  `ap-southeast-1`). Cross-region adds significant latency to every request.

### Hardening before real users
1. **Auth:** replace the demo cookie auth with Auth.js (NextAuth) + Prisma
   adapter; add email verification + password reset.
2. **File uploads:** move athlete videos from `/public/uploads` to object
   storage (S3 / Cloudflare R2). Local disk doesn't survive serverless deploys.
3. **Secrets rotation:** rotate the Supabase DB password and any AI keys that
   have ever appeared in chat transcripts or repos.
4. **Rate limits + AI cost caps** on the chat endpoint.

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

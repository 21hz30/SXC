# SXC — Hyrox Coach Dashboard

An AI-assisted training dashboard for Hyrox coaches: manage athletes, camps,
classes, structured workouts, and per-class performance — with a built-in
AI co-coach for drafting plans and athlete-specific guidance.

**Live app:** https://hybridtraining.cn/

**Stack:** Next.js 16 (App Router) · React 19 · Prisma 7 + PostgreSQL (Supabase) · Tailwind 4 · Anthropic SDK.

> **Auth:** a simple cookie-based session scheme. Every account is an admin —
> sign in or create an account from the **Register** page.

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
#    then open .env and fill in DATABASE_URL, SESSION_SECRET and (optionally) the AI keys

# 3. Create the database schema and load sample data
npm run db:setup

# 4. Start the dev server
npm run dev
```

Open **http://localhost:3000**, then create an account on the **Register** page.

## Environment variables

Copy `.env.example` to `.env` and set:

| Variable         | Required    | Description                                                            |
| ---------------- | ----------- | ---------------------------------------------------------------------- |
| `DATABASE_URL`   | yes         | Supabase **session-mode pooler** URL. Format: `postgresql://postgres.<ref>:<password>@aws-1-<region>.pooler.supabase.com:5432/postgres` |
| `SESSION_SECRET` | yes         | Secret used to sign session cookies. Use a long random string in prod. |
| `AI_API_KEY`     | for AI chat | API key for the model provider (Anthropic-compatible).                 |
| `AI_BASE_URL`    | for AI chat | Base URL of the model provider.                                        |
| `AI_MODEL`       | optional    | Model name (defaults to `deepseek-chat`).                              |

The app runs without the AI keys, but the **AI co-coach chat is disabled** until
`AI_API_KEY` (and usually `AI_BASE_URL`) are set.

## Common scripts

| Command              | What it does                                          |
| -------------------- | ----------------------------------------------------- |
| `npm run dev`        | Start the dev server (Turbopack) on port 3000.        |
| `npm run build`      | Production build.                                     |
| `npm start`          | Run the production build.                             |
| `npm run lint`       | Lint with ESLint.                                     |
| `npm run db:setup`   | Apply migrations + seed sample data (first-time local). |
| `npm run db:migrate` | Apply pending migrations only (no seed).              |
| `npm run db:seed`    | (Re)load sample data.                                 |

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

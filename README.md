# SXC — Hyrox Coach Dashboard

AI-assisted customer-management + training dashboard for Hyrox coaches.
Coaches manage customers, camps (cohorts), classes, structured workouts, attendance,
per-athlete performance/recovery tracking, and an AI co-coach with chat sessions.

## Stack

- **Next.js 16** (App Router) + TypeScript + Tailwind CSS v4
- **Prisma 7** + SQLite (local, via `better-sqlite3` adapter)
- **Anthropic SDK** against an Anthropic-compatible endpoint (DeepSeek) for the AI co-coach
- Layered architecture: `domain/` (business logic) · `tools/` (AI + slash-command tools) · `agent/` (LLM loop) · `app/` (UI + API routes)

## Getting started

```bash
npm install

# Configure environment (see below), then:
npx prisma migrate deploy
npx prisma generate
npx tsx prisma/seed.ts

npm run dev            # http://localhost:3000
```

### Environment variables (`.env`)

```
DATABASE_URL="file:./dev.db"
SESSION_SECRET="change-me-to-a-long-random-string"

# AI co-coach (Anthropic-compatible endpoint)
AI_API_KEY="sk-..."
AI_BASE_URL="https://api.deepseek.com/anthropic"
AI_MODEL="deepseek-v4-pro"
```

### Demo accounts

| Username | Password   | Role  |
|----------|------------|-------|
| `peter`  | `peter123` | admin |
| `src`    | `src123`   | coach |

## Features

- **Dashboard** — today's classes, todos, upcoming sessions, recent activity
- **Calendar** — day / week / month views
- **Camps** — cohorts with members, linked workouts (expandable), and a drag-and-drop schedule
- **Customers** — profiles, Garmin-style activity charts, video upload, benchmarks
- **Workouts** — structured Hyrox-aware editor (ski, sled, wall ball, run, etc.) with per-exercise distance/time/weight/pace, drag-to-reorder, tags
- **Classes** — multiple workouts, attendance, and a **Performance & Recovery** table (RPE, fatigue %, injury flags) for next-session planning
- **AI co-coach** — streaming chat with persistent sessions (optionally scoped to a customer), markdown rendering, slash commands (`/todo`) and tool-calling

## Notes

- Demo build. Authentication is intentionally lightweight; harden before production.
- `dev.db` is git-ignored — run the migrate + seed steps to recreate it locally.

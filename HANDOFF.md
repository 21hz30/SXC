# SXC — Handoff / Status

Quick orientation for picking up work. Local repo last pulled through commit
`4bca201` on 2026-07-04.

## What this is
SXC is a Hyrox coaching app (Next.js 16 + Prisma 7 + Postgres/Supabase),
live at **https://hybridtraining.cn**. Everyone is an athlete with a profile;
roles are **admin / coach / customer**.

## Repo & deploy
- GitHub: `21hz30/SXC` (branch `main`). Push to `main` auto-deploys on Vercel
  (project `people-earth`). The build runs migrations then `next build`.
- Commits: **do not add a `Co-Authored-By` line.**
- Work happens on `master` at `/Users/peterzhang/SXC`.

## Databases (two Supabase projects, same schema)
| | Project ref | Used by | Notes |
|---|---|---|---|
| **dev** | `auawpkzqdnquekyryxsq` | local (`.env` `DATABASE_URL`) | seed + test data; no `_prisma_migrations` table as of 2026-07-04 |
| **prod** | `rwsnadqkknpodsetszsq` | Vercel | real data; tracked migrations |

- Migrations need the **session pooler (`:5432`)**, not the transaction pooler
  (`:6543`, pgbouncer) which can't hold the migration lock.
- `scripts/migrate-deploy.mjs` (wired into `npm run build`) auto-applies
  pending migrations on **Vercel production** deploys, deriving the `:5432` URL.
  Local + preview builds skip it. So: add a migration, push to `main`, done.

## Local dev
```bash
npm run dev          # http://localhost:3000
```
Logins: `peter` / `peter123` (admin), `testathlete` / `test1234` (customer).

## Feature map (where things live)
- **Auth/roles:** `src/lib/auth.ts` (cached `getAccount`, `requireStaff/Admin`),
  `src/lib/access.ts` (scopes; `nonStaffCustomerWhere()`).
- **Accounts:** `src/domain/accounts.ts`; `/register` (customer signup),
  Team page `/(app)/coaches` (admin creates staff).
- **Tenants:** multi-tenant foundations are in `Tenant`, `tenantId` fields, and
  `/admin/tenants`; coaches are scoped through `src/lib/access.ts`.
- **Onboarding wizard:** `src/components/OnboardingModal.tsx` (3 steps),
  `/api/me/onboarding`. Race schedule constants in `src/domain/races.ts`.
- **Profile:** `/(app)/profile` → redirects to own `/customers/[id]`
  (auto-provisions a profile if missing).
- **Camps:** `/(app)/camps` + `[id]` — apply/approve flow (`CampMember.status`),
  members/details gated to active members.
- **Classes:** `/(app)/classes/[id]` — staff manage; customers get read-only
  plan + self sign-up. Quick sign-up/drop on lists via `ClassSignupButton` +
  `/api/class/[id]/signup`.
- **Off-class training:** `WorkoutAssignment` + `CoachAdvice` models; UI on the
  customer detail page "Training" tab. Workout library is role-split
  (customers see only their own private workouts).
- **AI chat:** `src/components/AiSidebar.tsx` + Zustand store
  `src/lib/stores/aiPanel.ts`; `MainShell.tsx` shrinks content when open.
- **Post-class reports / watch data / prompts:** `src/domain/reports.ts`,
  `ClassWatchData`, `Prompt` (editable at `/admin/prompts`).
- **Nutrition:** the standalone module and APIs are hidden by default through
  `NEXT_PUBLIC_FEATURE_NUTRITION`; historical data and report advice remain.
- **Account safety/recovery:** accounts use recoverable archive + audit history;
  `/forgot-password` looks up usernames by normalized phone and directs password
  help to administrator Peter. Legacy accounts without phones are prompted at login.

## Known follow-ups / not done
- Prisma dev migration bookkeeping is unresolved: dev schema exists, but
  `_prisma_migrations` is not present in `src-dev`.
- Perf floor is Supabase-in-Singapore latency (~200ms/query); pages already
  parallelize queries.

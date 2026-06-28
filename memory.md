# PeopleEarth working memory

## User preferences

- Prefer clear priority summaries: separate “most important” from “less important” and list items in order.
- For code review, focus first on security/data integrity, then build/lint correctness, then UX polish.
- Keep explanations concise but include enough context to decide what to do next.
- Do not print secrets from `.env` or database connection strings.
- Before changing Next.js code, remember this project uses Next.js 16; read relevant local docs in `node_modules/next/dist/docs/` when behavior may differ from older Next.js.

## Database workflow rule

- Always use the Supabase dev database first.
- Current known projects:
  - `src-dev`: `auawpkzqdnquekyryxsq`
  - `src-prod`: `rwsnadqkknpodsetszsq`
- Verify changes safely against dev before considering prod.
- Prod and dev should have the same schema/data format.
- Prod and dev should not have the same business data. Do not copy live prod data into dev, or dev test data into prod, unless explicitly approved.
- Before applying database changes:
  - inspect generated SQL/migrations first;
  - run/read-only checks against dev first;
  - only then consider prod migration after confirmation.
- Avoid `npm run build` as a casual check because this project’s build script runs `node scripts/migrate-deploy.mjs` before `next build`.

## Pre-merge / pre-commit checklist

- Confirm Git working tree and current branch.
- Pull/fetch latest GitHub state before final commit/push when safe.
- Review the staged diff and make sure unrelated work is not bundled together.
- Run:
  - `npm run lint`
  - `npx tsc --noEmit`
- If database/schema changes are involved, also run read-only Prisma/Supabase checks against dev first.
- Do not merge/push if lint, typecheck, or relevant database checks fail.

## Git commit standard

- Treat this as a company project: commit messages must be clear to teammates reading history later.
- Prefer small, focused commits. Split security fixes, lint cleanup, docs, UX, and database work when they are separable.
- Use Conventional Commit style:
  - `security(api): restrict class mutation routes`
  - `fix(lint): satisfy React purity rules`
  - `docs(memory): record workflow standards`
  - `chore(db): baseline dev migration history`
- Commit subject should explain the intent, not just the files changed.
- For larger commits, include a body with:
  - what changed;
  - why it changed;
  - how it was verified.
- Before pushing, report the exact commit subject and verification results to the user.
- Avoid force-pushing or rewriting pushed `main` history unless the user explicitly approves it.
- If a pushed commit message is unclear, prefer a follow-up clarifying commit/PR description over rewriting public history.

## Current todo list

1. Fix AI/customer privacy access:
   - `/api/customers` should return only customers accessible to the current user.
   - AI chat session creation should verify the chosen `customerId` is accessible.
   - AI customer context should not be built for inaccessible athletes.

2. Resolve Prisma migration bookkeeping for `src-dev`:
   - Actual dev database schema matches `prisma/schema.prisma`.
   - Prisma migration history currently does not show local migrations as applied.
   - Baseline/resolve carefully; do not blindly deploy migrations.

3. UX polish:
   - Add stronger loading/error states to login/register/profile/admin forms.
   - Improve onboarding save failure handling.
   - Keep mobile UX clean around AI panel, nav, and toasts.

4. After dev validation, compare prod/dev schema format:
   - ensure prod and dev schema shape match;
   - do not synchronize/copy row data unless explicitly requested.

## Recent completed work

- Updated local `.env` to connect to Supabase `src-dev`.
- Confirmed direct database connection works.
- Pulled latest GitHub `main`.
- Fixed class/calendar API authorization bugs.
- Fixed ESLint errors/warnings; `npm run lint` is clean.
- Confirmed `npx tsc --noEmit` is clean.

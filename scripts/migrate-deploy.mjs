// Runs `prisma migrate deploy` as part of the Vercel production build, so the
// database schema is always updated together with the code (no more
// new-code/old-schema window).
//
// Two gotchas this handles:
//  1. Only run on Vercel *production* deploys. Local builds and preview deploys
//     skip — the dev DB has no migration baseline, and previews shouldn't touch
//     prod schema.
//  2. Migrations need a session-capable connection. Supabase's transaction
//     pooler (:6543, pgbouncer) can't hold the migration advisory lock, so we
//     derive the session-pooler URL (:5432) from DATABASE_URL — unless an
//     explicit DIRECT_URL is provided, which we prefer.
import { execSync } from "node:child_process";

if (process.env.VERCEL_ENV !== "production") {
  console.log(`[migrate] Skipping — runs on Vercel production deploys only (VERCEL_ENV=${process.env.VERCEL_ENV ?? "unset"}).`);
  process.exit(0);
}

const raw = process.env.DIRECT_URL || process.env.DATABASE_URL;
if (!raw) {
  console.log("[migrate] No DATABASE_URL/DIRECT_URL — skipping.");
  process.exit(0);
}

let url = raw;
if (!process.env.DIRECT_URL) {
  try {
    const u = new URL(raw);
    if (u.port === "6543") u.port = "5432"; // transaction pooler -> session pooler
    u.searchParams.delete("pgbouncer");
    u.searchParams.delete("connection_limit");
    if (!u.searchParams.has("sslmode")) u.searchParams.set("sslmode", "require");
    url = u.toString();
  } catch {
    /* not a parseable URL — use as-is */
  }
}

console.log("[migrate] Applying pending migrations (prisma migrate deploy)…");
execSync("npx prisma migrate deploy", {
  stdio: "inherit",
  env: { ...process.env, DATABASE_URL: url },
});
console.log("[migrate] Done.");

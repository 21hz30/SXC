// One-shot backfill that wires the multi-tenant foundation on top of the
// current data. Safe to re-run — every write is idempotent.
//
// What it does:
//   1. Creates the SRC tenant (skipped if it already exists).
//   2. Demotes user "taylor" from admin → coach (per user instruction).
//   3. Generates a stable invitation code for every coach that doesn't
//      already have one (e.g. SRC-TAY-9X3K).
//   4. Stamps Camp.coachId = taylor on the two existing camps that don't
//      already have a coach assigned.
//   5. Assigns every coach (peter/dylan/taylor) and every coach-owned
//      Workout to the SRC tenant.
//   6. Marks every library Workout (ownerCustomerId IS NULL) as
//      createdByUserId = peter, visibility = "team".
//   7. Inserts CustomerCoach (taylor, active, source=coach_added) for every
//      existing customer so they keep seeing what they could before.
//
// Run with:  node scripts/backfill-multitenant.mjs

import pg from "pg";
import { randomBytes } from "node:crypto";

const { Client } = pg;

function envOrThrow(k) {
  const v = process.env[k];
  if (!v) throw new Error(`missing env: ${k}`);
  return v;
}

function shortCode(coach) {
  // SRC-TAY-9X3K → tenant slug + first 3 letters of coach username + 4 hex chars.
  // Hex chars come from a random buffer (Math.random is banned in some
  // contexts; randomBytes is consistent with the project's auth code).
  const head = (coach.username || "").slice(0, 3).toUpperCase().padEnd(3, "X");
  const tail = randomBytes(2).toString("hex").toUpperCase(); // 4 chars
  return `SRC-${head}-${tail}`;
}

async function main() {
  const c = new Client({ connectionString: envOrThrow("DEV_URL") });
  await c.connect();
  console.log("connected to dev");

  await c.query("BEGIN");
  try {
    // 1. SRC tenant
    let tenant = (await c.query(`SELECT id, slug, name FROM "Tenant" WHERE slug = 'src'`)).rows[0];
    if (!tenant) {
      const r = await c.query(
        `INSERT INTO "Tenant" (id, name, slug) VALUES ($1, $2, 'src') RETURNING id, slug, name`,
        ["tnt_" + randomBytes(8).toString("hex"), "SRC by Peoplearth"],
      );
      tenant = r.rows[0];
      console.log(`  ✓ SRC tenant created — ${tenant.id}`);
    } else {
      console.log(`  ⊘ SRC tenant already exists — ${tenant.id}`);
    }
    const tenantId = tenant.id;

    // 2. Taylor: admin → coach
    const taylor = (
      await c.query(`UPDATE "User" SET role = 'coach' WHERE username = 'taylor' RETURNING id, username, role`)
    ).rows[0];
    if (taylor) console.log(`  ✓ taylor demoted to coach — ${taylor.id}`);
    else console.log(`  ⊘ taylor not found, skipping`);

    // 3. Generate invitation codes for any coach (or admin who also serves as one)
    //    that doesn't have one yet.
    const coaches = (
      await c.query(
        `SELECT id, username FROM "User"
          WHERE role IN ('admin', 'coach')
            AND ("invitationCode" IS NULL OR "invitationCode" = '')`,
      )
    ).rows;
    for (const u of coaches) {
      let attempt = 0;
      while (attempt < 5) {
        const code = shortCode(u);
        try {
          await c.query(`UPDATE "User" SET "invitationCode" = $1 WHERE id = $2`, [code, u.id]);
          console.log(`  ✓ invitation code for ${u.username} → ${code}`);
          break;
        } catch (e) {
          // Unique collision — try again with a different tail.
          attempt++;
          if (attempt === 5) throw e;
        }
      }
    }

    // 4. Stamp Camp.coachId on any camp that doesn't have one.
    if (taylor) {
      const updated = await c.query(
        `UPDATE "Camp" SET "coachId" = $1 WHERE "coachId" IS NULL RETURNING id, name`,
        [taylor.id],
      );
      updated.rows.forEach((r) => console.log(`  ✓ stamped Camp "${r.name}" → coach taylor`));
    }

    // 5. Set tenantId = SRC on every coach/admin and every coach-authored Workout.
    const coachIds = (
      await c.query(`SELECT id, username FROM "User" WHERE role IN ('admin', 'coach')`)
    ).rows;
    if (coachIds.length) {
      await c.query(
        `UPDATE "User" SET "tenantId" = $1 WHERE id = ANY($2::text[]) AND "tenantId" IS NULL`,
        [tenantId, coachIds.map((u) => u.id)],
      );
      console.log(`  ✓ ${coachIds.length} coaches/admins tagged SRC`);
    }

    // 6. Peter as creator + team visibility for every library workout.
    const peter = (await c.query(`SELECT id FROM "User" WHERE username = 'peter'`)).rows[0];
    if (peter) {
      const r = await c.query(
        `UPDATE "Workout"
            SET "createdByUserId" = COALESCE("createdByUserId", $1),
                "tenantId"        = COALESCE("tenantId", $2),
                "visibility"      = CASE WHEN "visibility" = 'private' THEN 'team' ELSE "visibility" END
          WHERE "ownerCustomerId" IS NULL
          RETURNING id`,
        [peter.id, tenantId],
      );
      console.log(`  ✓ ${r.rowCount} library workouts → peter / SRC / team`);
    }

    // 7. CustomerCoach rows: every existing customer → taylor, active, coach_added.
    if (taylor) {
      const r = await c.query(
        `INSERT INTO "CustomerCoach"
            (id, "customerId", "coachUserId", status, source, "requestedAt", "approvedAt", "approvedById")
         SELECT 'cc_' || substr(md5(random()::text || cu.id), 1, 16),
                cu.id, $1, 'active', 'coach_added', NOW(), NOW(), $1
           FROM "Customer" cu
          WHERE NOT EXISTS (
            SELECT 1 FROM "CustomerCoach" cc WHERE cc."customerId" = cu.id AND cc."coachUserId" = $1
          )
         RETURNING id`,
        [taylor.id],
      );
      console.log(`  ✓ ${r.rowCount} CustomerCoach connections created (taylor, active)`);
    }

    await c.query("COMMIT");
    console.log("\nbackfill committed");

    // Quick sanity summary.
    const summary = (
      await c.query(`
        SELECT
          (SELECT count(*) FROM "Tenant") AS tenants,
          (SELECT count(*) FROM "User" WHERE "tenantId" IS NOT NULL) AS coaches_tagged,
          (SELECT count(*) FROM "User" WHERE "invitationCode" IS NOT NULL) AS coaches_with_codes,
          (SELECT count(*) FROM "Workout" WHERE "tenantId" IS NOT NULL) AS workouts_tagged,
          (SELECT count(*) FROM "Workout" WHERE visibility = 'team') AS team_workouts,
          (SELECT count(*) FROM "CustomerCoach" WHERE status = 'active') AS active_conns
      `)
    ).rows[0];
    console.log("\n=== summary ===");
    Object.entries(summary).forEach(([k, v]) => console.log(`  ${k.padEnd(20)} ${v}`));
  } catch (e) {
    await c.query("ROLLBACK");
    console.error("\nROLLED BACK:", e.message);
    process.exit(1);
  } finally {
    await c.end();
  }
}

main().catch((e) => {
  console.error("ERROR:", e);
  process.exit(1);
});

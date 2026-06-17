-- PR 1 (multi-tenant foundation): Tenant model + customer↔coach connections +
-- workout ownership/visibility. Backfill is in a separate script
-- (scripts/backfill-multitenant.mjs) so this migration is pure schema and
-- safe to re-run.

CREATE TABLE IF NOT EXISTS "Tenant" (
  "id"        TEXT PRIMARY KEY,
  "name"      TEXT NOT NULL,
  "slug"      TEXT NOT NULL,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "Tenant_slug_key" UNIQUE ("slug")
);

ALTER TABLE "User" ADD COLUMN IF NOT EXISTS "tenantId" TEXT;
ALTER TABLE "User" ADD COLUMN IF NOT EXISTS "invitationCode" TEXT;
CREATE UNIQUE INDEX IF NOT EXISTS "User_invitationCode_key" ON "User"("invitationCode")
  WHERE "invitationCode" IS NOT NULL;
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'User_tenantId_fkey') THEN
    ALTER TABLE "User" ADD CONSTRAINT "User_tenantId_fkey"
      FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE SET NULL ON UPDATE CASCADE;
  END IF;
END $$;

CREATE TABLE IF NOT EXISTS "CustomerCoach" (
  "id"           TEXT PRIMARY KEY,
  "customerId"   TEXT NOT NULL,
  "coachUserId"  TEXT NOT NULL,
  "status"       TEXT NOT NULL DEFAULT 'pending',
  "source"       TEXT NOT NULL,
  "requestedAt"  TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "approvedAt"   TIMESTAMP(3),
  "approvedById" TEXT,
  CONSTRAINT "CustomerCoach_customerId_fkey"
    FOREIGN KEY ("customerId") REFERENCES "Customer"("id") ON DELETE CASCADE ON UPDATE CASCADE,
  CONSTRAINT "CustomerCoach_coachUserId_fkey"
    FOREIGN KEY ("coachUserId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE,
  CONSTRAINT "CustomerCoach_approvedById_fkey"
    FOREIGN KEY ("approvedById") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE
);
CREATE UNIQUE INDEX IF NOT EXISTS "CustomerCoach_customerId_coachUserId_key"
  ON "CustomerCoach"("customerId", "coachUserId");
CREATE INDEX IF NOT EXISTS "CustomerCoach_coachUserId_status_idx"
  ON "CustomerCoach"("coachUserId", "status");
CREATE INDEX IF NOT EXISTS "CustomerCoach_customerId_status_idx"
  ON "CustomerCoach"("customerId", "status");

ALTER TABLE "Workout" ADD COLUMN IF NOT EXISTS "createdByUserId" TEXT;
ALTER TABLE "Workout" ADD COLUMN IF NOT EXISTS "tenantId"        TEXT;
ALTER TABLE "Workout" ADD COLUMN IF NOT EXISTS "visibility"      TEXT NOT NULL DEFAULT 'private';
CREATE INDEX IF NOT EXISTS "Workout_tenantId_visibility_idx" ON "Workout"("tenantId", "visibility");
CREATE INDEX IF NOT EXISTS "Workout_createdByUserId_idx"      ON "Workout"("createdByUserId");
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'Workout_createdByUserId_fkey') THEN
    ALTER TABLE "Workout" ADD CONSTRAINT "Workout_createdByUserId_fkey"
      FOREIGN KEY ("createdByUserId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'Workout_tenantId_fkey') THEN
    ALTER TABLE "Workout" ADD CONSTRAINT "Workout_tenantId_fkey"
      FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE SET NULL ON UPDATE CASCADE;
  END IF;
END $$;

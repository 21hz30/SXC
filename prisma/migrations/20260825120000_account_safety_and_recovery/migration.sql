-- Account lifecycle, audit history, normalized phones and reset challenges.
ALTER TABLE "User"
  ADD COLUMN "sessionVersion" INTEGER NOT NULL DEFAULT 0,
  ADD COLUMN "deletedAt" TIMESTAMP(3),
  ADD COLUMN "deletedByUserId" TEXT,
  ADD COLUMN "deleteReason" TEXT;

ALTER TABLE "Customer"
  ADD COLUMN "phoneNormalized" TEXT,
  ADD COLUMN "deletedAt" TIMESTAMP(3),
  ADD COLUMN "deletedByUserId" TEXT,
  ADD COLUMN "deleteReason" TEXT;

-- Legacy tenant setup could create a User without its required athlete profile.
-- Backfill one minimal profile per orphan so the next login can collect phone.
INSERT INTO "Customer" ("id", "name", "createdAt")
SELECT 'legacy_' || md5(u.id), u.name, CURRENT_TIMESTAMP
FROM "User" AS u
WHERE u."customerId" IS NULL;

UPDATE "User" AS u
SET "customerId" = c.id
FROM "Customer" AS c
WHERE u."customerId" IS NULL
  AND c.id = 'legacy_' || md5(u.id);

-- Backfill only unambiguous unique numbers. Any legacy collision stays NULL so
-- the affected account is prompted to provide a unique number on next login.
WITH candidates AS (
  SELECT
    id,
    CASE
      WHEN regexp_replace(phone, '[^0-9]', '', 'g') ~ '^1[3-9][0-9]{9}$'
        THEN '+86' || regexp_replace(phone, '[^0-9]', '', 'g')
      WHEN regexp_replace(phone, '[^0-9]', '', 'g') ~ '^861[3-9][0-9]{9}$'
        THEN '+' || regexp_replace(phone, '[^0-9]', '', 'g')
      WHEN phone LIKE '+%' AND length(regexp_replace(phone, '[^0-9]', '', 'g')) BETWEEN 7 AND 15
        THEN '+' || regexp_replace(phone, '[^0-9]', '', 'g')
      ELSE NULL
    END AS normalized
  FROM "Customer"
), unique_candidates AS (
  SELECT id, normalized, count(*) OVER (PARTITION BY normalized) AS copies
  FROM candidates
  WHERE normalized IS NOT NULL
)
UPDATE "Customer" AS c
SET "phoneNormalized" = u.normalized
FROM unique_candidates AS u
WHERE c.id = u.id AND u.copies = 1;

CREATE UNIQUE INDEX "Customer_phoneNormalized_key" ON "Customer"("phoneNormalized");
CREATE INDEX "Customer_deletedAt_idx" ON "Customer"("deletedAt");
CREATE INDEX "User_deletedAt_idx" ON "User"("deletedAt");

CREATE TABLE "AccountAuditLog" (
  "id" TEXT NOT NULL,
  "action" TEXT NOT NULL,
  "actorUserId" TEXT,
  "targetUserId" TEXT,
  "targetCustomerId" TEXT,
  "reason" TEXT,
  "metadataJson" TEXT,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "AccountAuditLog_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "AccountAuditLog_targetUserId_createdAt_idx" ON "AccountAuditLog"("targetUserId", "createdAt");
CREATE INDEX "AccountAuditLog_targetCustomerId_createdAt_idx" ON "AccountAuditLog"("targetCustomerId", "createdAt");
CREATE INDEX "AccountAuditLog_actorUserId_createdAt_idx" ON "AccountAuditLog"("actorUserId", "createdAt");
CREATE INDEX "AccountAuditLog_action_createdAt_idx" ON "AccountAuditLog"("action", "createdAt");

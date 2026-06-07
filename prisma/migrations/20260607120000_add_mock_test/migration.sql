-- "Mock test" classes: a flag on Class + a per-athlete result row (time per
-- exercise as JSON, or a single total time). Additive & idempotent-safe.
ALTER TABLE "Class" ADD COLUMN IF NOT EXISTS "isMockTest" BOOLEAN NOT NULL DEFAULT false;

CREATE TABLE IF NOT EXISTS "MockResult" (
    "id" TEXT NOT NULL,
    "classId" TEXT NOT NULL,
    "customerId" TEXT NOT NULL,
    "totalSec" INTEGER,
    "timesJson" TEXT,
    "notes" TEXT,
    "recordedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "MockResult_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX IF NOT EXISTS "MockResult_classId_customerId_key" ON "MockResult"("classId", "customerId");
CREATE INDEX IF NOT EXISTS "MockResult_customerId_recordedAt_idx" ON "MockResult"("customerId", "recordedAt");

DO $$ BEGIN
  ALTER TABLE "MockResult" ADD CONSTRAINT "MockResult_classId_fkey" FOREIGN KEY ("classId") REFERENCES "Class"("id") ON DELETE CASCADE ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN null; END $$;

DO $$ BEGIN
  ALTER TABLE "MockResult" ADD CONSTRAINT "MockResult_customerId_fkey" FOREIGN KEY ("customerId") REFERENCES "Customer"("id") ON DELETE CASCADE ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN null; END $$;

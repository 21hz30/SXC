-- Nutrition MVP — per-athlete meal + water logs, plus calories burned on each
-- training-plan workout. All three feed the dashboard's "Today's nutrition" card.

ALTER TABLE "WorkoutAssignment" ADD COLUMN IF NOT EXISTS "caloriesBurned" INTEGER;

CREATE TABLE IF NOT EXISTS "FoodLog" (
  "id"             TEXT PRIMARY KEY,
  "customerId"     TEXT NOT NULL,
  "loggedAt"       TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "mealType"       TEXT,
  "description"    TEXT NOT NULL,
  "imageUrl"       TEXT,
  "calories"       INTEGER,
  "proteinG"       DOUBLE PRECISION,
  "carbsG"         DOUBLE PRECISION,
  "fatG"           DOUBLE PRECISION,
  "fiberG"         DOUBLE PRECISION,
  "aiAnalysisJson" TEXT,
  "notes"          TEXT,
  "createdAt"      TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt"      TIMESTAMP(3) NOT NULL,
  CONSTRAINT "FoodLog_customerId_fkey" FOREIGN KEY ("customerId") REFERENCES "Customer"("id") ON DELETE CASCADE ON UPDATE CASCADE
);
CREATE INDEX IF NOT EXISTS "FoodLog_customerId_loggedAt_idx" ON "FoodLog"("customerId", "loggedAt");

CREATE TABLE IF NOT EXISTS "WaterLog" (
  "id"         TEXT PRIMARY KEY,
  "customerId" TEXT NOT NULL,
  "loggedAt"   TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "amountMl"   INTEGER NOT NULL,
  "notes"      TEXT,
  "createdAt"  TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "WaterLog_customerId_fkey" FOREIGN KEY ("customerId") REFERENCES "Customer"("id") ON DELETE CASCADE ON UPDATE CASCADE
);
CREATE INDEX IF NOT EXISTS "WaterLog_customerId_loggedAt_idx" ON "WaterLog"("customerId", "loggedAt");

CREATE TABLE IF NOT EXISTS "WeightLog" (
  "id"         TEXT PRIMARY KEY,
  "customerId" TEXT NOT NULL,
  "loggedAt"   TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "weightKg"   DOUBLE PRECISION NOT NULL,
  "notes"      TEXT,
  "createdAt"  TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "WeightLog_customerId_fkey" FOREIGN KEY ("customerId") REFERENCES "Customer"("id") ON DELETE CASCADE ON UPDATE CASCADE
);
CREATE INDEX IF NOT EXISTS "WeightLog_customerId_loggedAt_idx" ON "WeightLog"("customerId", "loggedAt");

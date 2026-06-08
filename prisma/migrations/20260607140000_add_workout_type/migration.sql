-- Library category for a workout (relax | weekly | class | mock), for filtering
-- the workouts page. Nullable + additive — safe on existing rows.
ALTER TABLE "Workout" ADD COLUMN IF NOT EXISTS "type" TEXT;

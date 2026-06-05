-- Camp weekly plan: allow multiple workouts per member on the same camp day.
-- The old per-day uniqueness (one workout per member per day) is replaced by a
-- uniqueness that also includes the workout.
DROP INDEX IF EXISTS "WorkoutAssignment_campId_customerId_scheduledDate_key";
CREATE UNIQUE INDEX "WorkoutAssignment_plan_unique" ON "WorkoutAssignment"("campId", "customerId", "scheduledDate", "workoutId");

-- Resolve schema drift found in the prod/dev audit:
-- (a) ensure the Workout.ownerCustomerId index exists (prod already has it from an
--     earlier migration; dev and fresh environments were missing it).
CREATE INDEX IF NOT EXISTS "Workout_ownerCustomerId_idx" ON "Workout"("ownerCustomerId");
-- (b) drop the orphaned, unused restAdvice column (removed from the schema long ago,
--     but never dropped from the database).
ALTER TABLE "WorkoutAssignment" DROP COLUMN IF EXISTS "restAdvice";

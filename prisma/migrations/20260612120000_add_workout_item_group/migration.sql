-- Add the exercise-group columns to WorkoutItem:
--   groupKey      — items sharing this value form one combined block (null = solo)
--   groupTimeSec  — the group's shared total time, set only on the first item of a group
ALTER TABLE "WorkoutItem"
  ADD COLUMN IF NOT EXISTS "groupKey" TEXT,
  ADD COLUMN IF NOT EXISTS "groupTimeSec" INTEGER;

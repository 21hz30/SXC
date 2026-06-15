-- Fractional distances (37.5 m sled push) and a "repeat the group N times"
-- knob. Distance INTEGER → DOUBLE PRECISION preserves all existing values
-- (integer 50 still reads as 50.0).
ALTER TABLE "WorkoutItem"
  ALTER COLUMN "distanceM" TYPE DOUBLE PRECISION
  USING "distanceM"::double precision;

ALTER TABLE "WorkoutItem"
  ADD COLUMN IF NOT EXISTS "groupRounds" INTEGER;

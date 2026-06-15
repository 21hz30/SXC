-- Staff can pre-release a class's workout to members before the auto 30-min
-- window. Null = wait for the auto reveal (default behaviour).
ALTER TABLE "Class" ADD COLUMN IF NOT EXISTS "workoutsRevealedAt" TIMESTAMP(3);

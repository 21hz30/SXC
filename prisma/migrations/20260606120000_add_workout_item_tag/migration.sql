-- Add an optional training tag to each exercise (warmup | strength | cardio |
-- core | mobility | cooldown). Nullable + additive, so it's safe on existing rows.
ALTER TABLE "WorkoutItem" ADD COLUMN IF NOT EXISTS "tag" TEXT;

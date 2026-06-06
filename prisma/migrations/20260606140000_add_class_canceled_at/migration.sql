-- A class can be canceled by a coach. Nullable + additive — safe on existing rows.
-- The other statuses (open / full / finished) are derived, so no column needed.
ALTER TABLE "Class" ADD COLUMN IF NOT EXISTS "canceledAt" TIMESTAMP(3);

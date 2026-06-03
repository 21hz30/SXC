-- Onboarding flag for first-login profile completion.
ALTER TABLE "Customer" ADD COLUMN "onboardedAt" TIMESTAMP(3);

-- Private, customer-owned workouts (visible only to that customer).
ALTER TABLE "Workout" ADD COLUMN "ownerCustomerId" TEXT;
ALTER TABLE "Workout" ADD CONSTRAINT "Workout_ownerCustomerId_fkey"
  FOREIGN KEY ("ownerCustomerId") REFERENCES "Customer"("id") ON DELETE CASCADE ON UPDATE CASCADE;
CREATE INDEX "Workout_ownerCustomerId_idx" ON "Workout"("ownerCustomerId");

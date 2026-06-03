-- Athlete's planned races (race + division), sourced from the curated schedule.
CREATE TABLE "RacePlan" (
    "id" TEXT NOT NULL,
    "customerId" TEXT NOT NULL,
    "raceId" TEXT NOT NULL,
    "raceName" TEXT NOT NULL,
    "raceDate" TIMESTAMP(3) NOT NULL,
    "division" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "RacePlan_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX "RacePlan_customerId_raceId_division_key" ON "RacePlan"("customerId", "raceId", "division");
CREATE INDEX "RacePlan_customerId_raceDate_idx" ON "RacePlan"("customerId", "raceDate");
ALTER TABLE "RacePlan" ADD CONSTRAINT "RacePlan_customerId_fkey" FOREIGN KEY ("customerId") REFERENCES "Customer"("id") ON DELETE CASCADE ON UPDATE CASCADE;

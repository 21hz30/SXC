-- Sport-watch / wearable metrics per athlete per class.
CREATE TABLE "ClassWatchData" (
    "id" TEXT NOT NULL,
    "classId" TEXT NOT NULL,
    "customerId" TEXT NOT NULL,
    "durationSec" INTEGER,
    "distanceM" INTEGER,
    "avgHr" INTEGER,
    "maxHr" INTEGER,
    "caloriesKcal" INTEGER,
    "avgCadence" INTEGER,
    "zone1Sec" INTEGER,
    "zone2Sec" INTEGER,
    "zone3Sec" INTEGER,
    "zone4Sec" INTEGER,
    "zone5Sec" INTEGER,
    "source" TEXT NOT NULL DEFAULT 'manual',
    "notes" TEXT,
    "recordedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ClassWatchData_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "ClassWatchData_classId_customerId_key" ON "ClassWatchData"("classId", "customerId");
CREATE INDEX "ClassWatchData_customerId_recordedAt_idx" ON "ClassWatchData"("customerId", "recordedAt");

ALTER TABLE "ClassWatchData" ADD CONSTRAINT "ClassWatchData_classId_fkey" FOREIGN KEY ("classId") REFERENCES "Class"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "ClassWatchData" ADD CONSTRAINT "ClassWatchData_customerId_fkey" FOREIGN KEY ("customerId") REFERENCES "Customer"("id") ON DELETE CASCADE ON UPDATE CASCADE;

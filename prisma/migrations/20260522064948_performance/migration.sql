-- CreateTable
CREATE TABLE "Performance" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "classId" TEXT NOT NULL,
    "customerId" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'pending',
    "rpe" INTEGER,
    "fatiguePct" INTEGER,
    "feeling" TEXT,
    "injuryNote" TEXT,
    "notes" TEXT,
    "resultsJson" TEXT,
    "updatedAt" DATETIME NOT NULL,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "Performance_classId_fkey" FOREIGN KEY ("classId") REFERENCES "Class" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "Performance_customerId_fkey" FOREIGN KEY ("customerId") REFERENCES "Customer" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateIndex
CREATE INDEX "Performance_customerId_createdAt_idx" ON "Performance"("customerId", "createdAt");

-- CreateIndex
CREATE UNIQUE INDEX "Performance_classId_customerId_key" ON "Performance"("classId", "customerId");

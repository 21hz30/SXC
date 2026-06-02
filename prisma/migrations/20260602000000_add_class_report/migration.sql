-- AI-generated post-class report, one row per (class, customer).
CREATE TABLE "ClassReport" (
    "id" TEXT NOT NULL,
    "classId" TEXT NOT NULL,
    "customerId" TEXT NOT NULL,
    "contentMarkdown" TEXT NOT NULL,
    "model" TEXT,
    "generatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "publishedAt" TIMESTAMP(3),

    CONSTRAINT "ClassReport_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "ClassReport_classId_customerId_key" ON "ClassReport"("classId", "customerId");
CREATE INDEX "ClassReport_customerId_generatedAt_idx" ON "ClassReport"("customerId", "generatedAt");

ALTER TABLE "ClassReport" ADD CONSTRAINT "ClassReport_classId_fkey" FOREIGN KEY ("classId") REFERENCES "Class"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "ClassReport" ADD CONSTRAINT "ClassReport_customerId_fkey" FOREIGN KEY ("customerId") REFERENCES "Customer"("id") ON DELETE CASCADE ON UPDATE CASCADE;

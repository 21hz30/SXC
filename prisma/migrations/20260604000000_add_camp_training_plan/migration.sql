-- AlterTable
ALTER TABLE "WorkoutAssignment" ADD COLUMN     "campId" TEXT;

-- CreateIndex
CREATE UNIQUE INDEX "WorkoutAssignment_campId_customerId_scheduledDate_key" ON "WorkoutAssignment"("campId", "customerId", "scheduledDate");

-- AddForeignKey
ALTER TABLE "WorkoutAssignment" ADD CONSTRAINT "WorkoutAssignment_campId_fkey" FOREIGN KEY ("campId") REFERENCES "Camp"("id") ON DELETE SET NULL ON UPDATE CASCADE;

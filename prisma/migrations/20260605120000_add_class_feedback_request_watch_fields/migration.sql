-- AlterTable
ALTER TABLE "Class" ADD COLUMN     "feedbackRequestedAt" TIMESTAMP(3);
-- AlterTable
ALTER TABLE "ClassWatchData" ADD COLUMN     "activeCalories" INTEGER,
ADD COLUMN     "aerobicTE" DOUBLE PRECISION,
ADD COLUMN     "anaerobicTE" DOUBLE PRECISION,
ADD COLUMN     "exerciseLoad" INTEGER,
ADD COLUMN     "restingCalories" INTEGER,
ADD COLUMN     "sweatLossMl" INTEGER;

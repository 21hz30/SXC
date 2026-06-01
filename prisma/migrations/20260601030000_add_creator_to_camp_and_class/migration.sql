-- Add immutable creator attribution to camps and classes.
ALTER TABLE "Camp" ADD COLUMN "createdById" TEXT;
ALTER TABLE "Class" ADD COLUMN "createdById" TEXT;
ALTER TABLE "Camp" ADD CONSTRAINT "Camp_createdById_fkey" FOREIGN KEY ("createdById") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "Class" ADD CONSTRAINT "Class_createdById_fkey" FOREIGN KEY ("createdById") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

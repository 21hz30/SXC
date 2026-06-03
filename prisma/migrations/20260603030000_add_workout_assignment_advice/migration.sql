-- Off-class workout assignments with athlete completion log + coach guidance.
CREATE TABLE "WorkoutAssignment" (
    "id" TEXT NOT NULL,
    "customerId" TEXT NOT NULL,
    "workoutId" TEXT NOT NULL,
    "assignedById" TEXT,
    "scheduledDate" TIMESTAMP(3),
    "status" TEXT NOT NULL DEFAULT 'assigned',
    "completedAt" TIMESTAMP(3),
    "rpe" INTEGER,
    "feeling" TEXT,
    "notes" TEXT,
    "resultsJson" TEXT,
    "coachSuggestion" TEXT,
    "foodAdvice" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "WorkoutAssignment_pkey" PRIMARY KEY ("id")
);
CREATE INDEX "WorkoutAssignment_customerId_status_idx" ON "WorkoutAssignment"("customerId", "status");
CREATE INDEX "WorkoutAssignment_customerId_scheduledDate_idx" ON "WorkoutAssignment"("customerId", "scheduledDate");
ALTER TABLE "WorkoutAssignment" ADD CONSTRAINT "WorkoutAssignment_customerId_fkey" FOREIGN KEY ("customerId") REFERENCES "Customer"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "WorkoutAssignment" ADD CONSTRAINT "WorkoutAssignment_workoutId_fkey" FOREIGN KEY ("workoutId") REFERENCES "Workout"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- Standing coach-to-athlete advice feed.
CREATE TABLE "CoachAdvice" (
    "id" TEXT NOT NULL,
    "customerId" TEXT NOT NULL,
    "authorId" TEXT,
    "kind" TEXT NOT NULL DEFAULT 'general',
    "body" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "CoachAdvice_pkey" PRIMARY KEY ("id")
);
CREATE INDEX "CoachAdvice_customerId_createdAt_idx" ON "CoachAdvice"("customerId", "createdAt");
ALTER TABLE "CoachAdvice" ADD CONSTRAINT "CoachAdvice_customerId_fkey" FOREIGN KEY ("customerId") REFERENCES "Customer"("id") ON DELETE CASCADE ON UPDATE CASCADE;

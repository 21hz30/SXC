/*
  Warnings:

  - You are about to drop the column `workoutId` on the `Class` table. All the data in the column will be lost.
  - You are about to drop the column `blocksJson` on the `Workout` table. All the data in the column will be lost.

*/
-- CreateTable
CREATE TABLE "WorkoutItem" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "workoutId" TEXT NOT NULL,
    "order" INTEGER NOT NULL DEFAULT 0,
    "category" TEXT NOT NULL,
    "label" TEXT,
    "distanceM" INTEGER,
    "timeSec" INTEGER,
    "weightKg" REAL,
    "reps" INTEGER,
    "sets" INTEGER,
    "paceSecPerKm" INTEGER,
    "heightM" REAL,
    "notes" TEXT,
    CONSTRAINT "WorkoutItem_workoutId_fkey" FOREIGN KEY ("workoutId") REFERENCES "Workout" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "ClassWorkout" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "classId" TEXT NOT NULL,
    "workoutId" TEXT NOT NULL,
    "order" INTEGER NOT NULL DEFAULT 0,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "ClassWorkout_classId_fkey" FOREIGN KEY ("classId") REFERENCES "Class" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "ClassWorkout_workoutId_fkey" FOREIGN KEY ("workoutId") REFERENCES "Workout" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- RedefineTables
PRAGMA defer_foreign_keys=ON;
PRAGMA foreign_keys=OFF;
CREATE TABLE "new_Class" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "title" TEXT NOT NULL,
    "startsAt" DATETIME NOT NULL,
    "durationMin" INTEGER NOT NULL DEFAULT 60,
    "location" TEXT,
    "capacity" INTEGER NOT NULL DEFAULT 12,
    "notes" TEXT,
    "campId" TEXT,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "Class_campId_fkey" FOREIGN KEY ("campId") REFERENCES "Camp" ("id") ON DELETE SET NULL ON UPDATE CASCADE
);
INSERT INTO "new_Class" ("campId", "capacity", "createdAt", "durationMin", "id", "location", "notes", "startsAt", "title") SELECT "campId", "capacity", "createdAt", "durationMin", "id", "location", "notes", "startsAt", "title" FROM "Class";
DROP TABLE "Class";
ALTER TABLE "new_Class" RENAME TO "Class";
CREATE TABLE "new_Workout" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "name" TEXT NOT NULL,
    "description" TEXT,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
);
INSERT INTO "new_Workout" ("createdAt", "description", "id", "name") SELECT "createdAt", "description", "id", "name" FROM "Workout";
DROP TABLE "Workout";
ALTER TABLE "new_Workout" RENAME TO "Workout";
PRAGMA foreign_keys=ON;
PRAGMA defer_foreign_keys=OFF;

-- CreateIndex
CREATE INDEX "WorkoutItem_workoutId_order_idx" ON "WorkoutItem"("workoutId", "order");

-- CreateIndex
CREATE INDEX "ClassWorkout_classId_order_idx" ON "ClassWorkout"("classId", "order");

-- CreateIndex
CREATE UNIQUE INDEX "ClassWorkout_classId_workoutId_key" ON "ClassWorkout"("classId", "workoutId");

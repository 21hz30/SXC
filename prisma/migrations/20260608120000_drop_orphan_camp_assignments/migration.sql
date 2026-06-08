-- One-time cleanup: remove camp training-plan assignments left behind when a
-- member dropped out of (or was removed from) a camp. Those rows used to linger,
-- so a former member could still see the camp's plan. Workouts they had already
-- completed are kept as history (status = 'completed' is excluded).
-- Going forward, leaveCamp / removeMember delete these at the source.
DELETE FROM "WorkoutAssignment" wa
WHERE wa."campId" IS NOT NULL
  AND wa.status <> 'completed'
  AND NOT EXISTS (
    SELECT 1 FROM "CampMember" cm
    WHERE cm."campId" = wa."campId"
      AND cm."customerId" = wa."customerId"
      AND cm.status = 'active'
  );

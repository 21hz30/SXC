import { db } from "@/lib/db";
import { startOfDay } from "@/lib/utils";

/**
 * Give a newly-active camp member the camp's already-assigned **upcoming** plan,
 * so someone who joins AFTER the coach assigned the week still receives the
 * workouts on their dashboard + calendar.
 *
 * The camp plan lives as one WorkoutAssignment per (member, workout, day); we
 * take the distinct upcoming (day, workout) the existing members already have
 * and create any the new member is missing. Classes are camp-wide and show up
 * automatically once you're a member, so they need no backfill.
 *
 * Safe to call repeatedly — it only adds what's missing (and the unique index
 * guards against duplicates).
 */
export async function backfillCampPlan(
  campId: string,
  customerId: string,
  assignedById: string | null = null,
): Promise<number> {
  const existing = await db.workoutAssignment.findMany({
    where: { campId, scheduledDate: { gte: startOfDay() } },
    select: { scheduledDate: true, workoutId: true, coachSuggestion: true, customerId: true },
  });
  if (existing.length === 0) return 0;

  const template = new Map<string, { scheduledDate: Date; workoutId: string; note: string | null }>();
  const mine = new Set<string>();
  for (const r of existing) {
    if (!r.scheduledDate) continue;
    const key = `${r.scheduledDate.toISOString()}|${r.workoutId}`;
    if (r.customerId === customerId) {
      mine.add(key);
    } else if (!template.has(key)) {
      template.set(key, { scheduledDate: r.scheduledDate, workoutId: r.workoutId, note: r.coachSuggestion });
    }
  }

  const toCreate: { campId: string; customerId: string; workoutId: string; scheduledDate: Date; assignedById: string | null; coachSuggestion: string | null }[] = [];
  for (const [key, v] of template) {
    if (mine.has(key)) continue;
    toCreate.push({ campId, customerId, workoutId: v.workoutId, scheduledDate: v.scheduledDate, assignedById, coachSuggestion: v.note });
  }
  if (toCreate.length) await db.workoutAssignment.createMany({ data: toCreate, skipDuplicates: true });
  return toCreate.length;
}

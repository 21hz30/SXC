import { createHash } from "node:crypto";
import { db } from "@/lib/db";
import { workoutScope } from "@/lib/access";
import { mondayOf } from "@/lib/utils";
import type { SessionUser } from "@/lib/auth";

const MAX_CUSTOMERS = 200;
const MAX_WORKOUTS_PER_DAY = 8;
const MAX_NOTE_LENGTH = 500;
const INSERT_CHUNK_SIZE = 500;

type PlanWorkout = { workoutId: string; note: string | null };
type PlanDay = { workouts: PlanWorkout[] };

export type WeeklyPlanResult =
  | { ok: true; weekStart: string; customers: number; created: number; skipped: number }
  | { ok: false; message: string };

function parseInput(raw: unknown):
  | { ok: true; weekStart: string; customerIds: string[]; days: PlanDay[] }
  | { ok: false; message: string } {
  if (!raw || typeof raw !== "object") return { ok: false, message: "Invalid weekly plan" };
  const value = raw as { weekStart?: unknown; customerIds?: unknown; days?: unknown };
  const requestedWeek = typeof value.weekStart === "string" ? value.weekStart.trim() : "";
  if (!/^\d{4}-\d{2}-\d{2}$/.test(requestedWeek)) return { ok: false, message: "Choose a valid week" };
  const weekStart = mondayOf(requestedWeek);
  const base = new Date(`${weekStart}T00:00:00Z`);
  if (Number.isNaN(base.getTime())) return { ok: false, message: "Choose a valid week" };

  if (!Array.isArray(value.customerIds)) return { ok: false, message: "Select at least one subscriber" };
  const customerIds = [...new Set(value.customerIds.filter((id): id is string => typeof id === "string" && id.length > 0))];
  if (customerIds.length === 0) return { ok: false, message: "Select at least one subscriber" };
  if (customerIds.length > MAX_CUSTOMERS) return { ok: false, message: `Select no more than ${MAX_CUSTOMERS} subscribers at once` };

  if (!Array.isArray(value.days) || value.days.length !== 7) return { ok: false, message: "A weekly plan must contain seven days" };
  const days: PlanDay[] = value.days.map((rawDay) => {
    const rows = rawDay && typeof rawDay === "object" && Array.isArray((rawDay as { workouts?: unknown }).workouts)
      ? (rawDay as { workouts: unknown[] }).workouts
      : [];
    const seen = new Set<string>();
    const workouts: PlanWorkout[] = [];
    for (const rawWorkout of rows.slice(0, MAX_WORKOUTS_PER_DAY)) {
      if (!rawWorkout || typeof rawWorkout !== "object") continue;
      const row = rawWorkout as { workoutId?: unknown; note?: unknown };
      const workoutId = typeof row.workoutId === "string" ? row.workoutId.trim() : "";
      if (!workoutId || seen.has(workoutId)) continue;
      seen.add(workoutId);
      workouts.push({
        workoutId,
        note: typeof row.note === "string" ? row.note.trim().slice(0, MAX_NOTE_LENGTH) || null : null,
      });
    }
    return { workouts };
  });
  if (!days.some((day) => day.workouts.length > 0)) return { ok: false, message: "Add at least one workout" };
  return { ok: true, weekStart, customerIds, days };
}

function assignmentId(actorId: string, customerId: string, workoutId: string, scheduledDate: Date): string {
  const digest = createHash("sha256")
    .update(`${actorId}|${customerId}|${workoutId}|${scheduledDate.toISOString()}`)
    .digest("hex")
    .slice(0, 24);
  return `wpa_${digest}`;
}

export async function assignWeeklyPlan(actor: SessionUser, rawInput: unknown): Promise<WeeklyPlanResult> {
  if (actor.role !== "admin" && actor.role !== "coach") return { ok: false, message: "Staff access required" };
  const parsed = parseInput(rawInput);
  if (!parsed.ok) return parsed;

  const workoutIds = [...new Set(parsed.days.flatMap((day) => day.workouts.map((workout) => workout.workoutId)))];
  const [connections, workouts] = await Promise.all([
    db.customerCoach.findMany({
      where: {
        status: "active",
        customerId: { in: parsed.customerIds },
        ...(actor.role === "coach" ? { coachUserId: actor.id } : {}),
      },
      select: { customerId: true },
    }),
    db.workout.findMany({
      where: { AND: [workoutScope(actor), { id: { in: workoutIds } }] },
      select: { id: true },
    }),
  ]);

  const allowedCustomers = new Set(connections.map((connection) => connection.customerId));
  if (parsed.customerIds.some((id) => !allowedCustomers.has(id))) {
    return { ok: false, message: "One or more subscribers are no longer active for your account" };
  }
  const allowedWorkouts = new Set(workouts.map((workout) => workout.id));
  if (workoutIds.some((id) => !allowedWorkouts.has(id))) {
    return { ok: false, message: "One or more workouts are outside your library" };
  }

  const base = new Date(`${parsed.weekStart}T00:00:00Z`);
  const weekEnd = new Date(base.getTime() + 7 * 86_400_000);
  const existing = await db.workoutAssignment.findMany({
    where: {
      assignedById: actor.id,
      campId: null,
      customerId: { in: parsed.customerIds },
      workoutId: { in: workoutIds },
      scheduledDate: { gte: base, lt: weekEnd },
    },
    select: { customerId: true, workoutId: true, scheduledDate: true },
  });
  const existingKeys = new Set(
    existing
      .filter((row) => row.scheduledDate)
      .map((row) => `${row.customerId}|${row.workoutId}|${row.scheduledDate!.toISOString()}`),
  );

  const rows: {
    id: string;
    customerId: string;
    workoutId: string;
    assignedById: string;
    scheduledDate: Date;
    coachSuggestion: string | null;
  }[] = [];
  let skipped = 0;
  for (const customerId of parsed.customerIds) {
    for (let dayIndex = 0; dayIndex < parsed.days.length; dayIndex += 1) {
      const scheduledDate = new Date(base.getTime() + dayIndex * 86_400_000);
      for (const workout of parsed.days[dayIndex].workouts) {
        const key = `${customerId}|${workout.workoutId}|${scheduledDate.toISOString()}`;
        if (existingKeys.has(key)) {
          skipped += 1;
          continue;
        }
        rows.push({
          id: assignmentId(actor.id, customerId, workout.workoutId, scheduledDate),
          customerId,
          workoutId: workout.workoutId,
          assignedById: actor.id,
          scheduledDate,
          coachSuggestion: workout.note,
        });
      }
    }
  }

  let created = 0;
  for (let start = 0; start < rows.length; start += INSERT_CHUNK_SIZE) {
    const result = await db.workoutAssignment.createMany({
      data: rows.slice(start, start + INSERT_CHUNK_SIZE),
      skipDuplicates: true,
    });
    created += result.count;
  }
  skipped += rows.length - created;

  return { ok: true, weekStart: parsed.weekStart, customers: parsed.customerIds.length, created, skipped };
}

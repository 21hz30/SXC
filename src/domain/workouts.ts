import { db } from "@/lib/db";
import { revalidatePath } from "next/cache";
import type { Ctx } from "./types";
import type { Category, WorkoutItemInput } from "./exercises";

export type WorkoutItemDTO = {
  id: string;
  order: number;
  category: Category;
  label: string | null;
  distanceM: number | null;
  timeSec: number | null;
  weightKg: number | null;
  reps: number | null;
  sets: number | null;
  paceSecPerKm: number | null;
  heightM: number | null;
  notes: string | null;
};

export type WorkoutDTO = {
  id: string;
  name: string;
  description: string | null;
  tags: string | null;
  items: WorkoutItemDTO[];
};

function bust(workoutId?: string) {
  revalidatePath("/workouts");
  if (workoutId) revalidatePath(`/workouts/${workoutId}`);
}

function toItemDTO(r: Awaited<ReturnType<typeof db.workoutItem.findFirst>>): WorkoutItemDTO {
  return {
    id: r!.id,
    order: r!.order,
    category: r!.category as Category,
    label: r!.label,
    distanceM: r!.distanceM,
    timeSec: r!.timeSec,
    weightKg: r!.weightKg,
    reps: r!.reps,
    sets: r!.sets,
    paceSecPerKm: r!.paceSecPerKm,
    heightM: r!.heightM,
    notes: r!.notes,
  };
}

export async function listWorkouts(_ctx: Ctx) {
  return db.workout.findMany({
    orderBy: { createdAt: "desc" },
    include: {
      items: { orderBy: { order: "asc" } },
      classes: true,
      camps: { include: { camp: true } },
    },
  });
}

export async function getWorkout(_ctx: Ctx, id: string): Promise<WorkoutDTO | null> {
  const w = await db.workout.findUnique({
    where: { id },
    include: { items: { orderBy: { order: "asc" } } },
  });
  if (!w) return null;
  return {
    id: w.id,
    name: w.name,
    description: w.description,
    tags: w.tags,
    items: w.items.map(toItemDTO),
  };
}

/**
 * Atomic batch save: updates workout meta + tags and replaces ALL items
 * with the provided ordered list. Used by the editor's Save button.
 */
export async function saveWorkout(
  _ctx: Ctx,
  id: string,
  input: { name: string; description?: string | null; tags?: string | null; items: WorkoutItemInput[] }
) {
  await db.$transaction([
    db.workout.update({
      where: { id },
      data: {
        name: input.name.trim() || "Untitled workout",
        description: input.description?.trim() || null,
        tags: input.tags?.trim() || null,
      },
    }),
    db.workoutItem.deleteMany({ where: { workoutId: id } }),
    db.workoutItem.createMany({
      data: input.items.map((it, i) => ({
        workoutId: id,
        order: i,
        category: it.category,
        label: it.label ?? null,
        distanceM: it.distanceM ?? null,
        timeSec: it.timeSec ?? null,
        weightKg: it.weightKg ?? null,
        reps: it.reps ?? null,
        sets: it.sets ?? null,
        paceSecPerKm: it.paceSecPerKm ?? null,
        heightM: it.heightM ?? null,
        notes: it.notes ?? null,
      })),
    }),
  ]);
  bust(id);
}

export async function createWorkout(_ctx: Ctx, input: { name: string; description?: string | null }) {
  const w = await db.workout.create({
    data: { name: input.name.trim(), description: input.description?.trim() || null },
  });
  bust();
  return w;
}

export async function updateWorkoutMeta(_ctx: Ctx, id: string, input: { name?: string; description?: string | null }) {
  await db.workout.update({
    where: { id },
    data: {
      ...(input.name != null ? { name: input.name.trim() } : {}),
      ...(input.description !== undefined ? { description: input.description?.trim() || null } : {}),
    },
  });
  bust(id);
}

export async function deleteWorkout(_ctx: Ctx, id: string) {
  await db.workout.delete({ where: { id } });
  bust();
}

// Per-item mutations were replaced by the atomic saveWorkout() above.
// The editor edits a local draft and persists everything in one PUT.

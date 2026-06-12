import { db } from "@/lib/db";
import { revalidatePath } from "next/cache";
import { getMyCustomerId } from "@/lib/auth";
import type { Ctx } from "./types";
import type { Category, WorkoutItemInput } from "./exercises";

/**
 * Guard for editing/deleting a workout: staff may touch shared library
 * workouts; a customer may touch only their own private workouts. Throws if
 * the workout doesn't exist or the caller isn't allowed.
 */
export async function assertCanEditWorkout(ctx: Ctx, workoutId: string): Promise<void> {
  const w = await db.workout.findUnique({ where: { id: workoutId }, select: { ownerCustomerId: true } });
  if (!w) throw new Error("workout not found");
  const staff = ctx.user.role === "admin" || ctx.user.role === "coach";
  if (staff) {
    if (w.ownerCustomerId !== null) throw new Error("forbidden: athlete-owned workout");
    return;
  }
  const myCid = await getMyCustomerId();
  if (w.ownerCustomerId !== myCid) throw new Error("forbidden");
}

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
  tag: string | null;
  groupKey: string | null;
  groupTimeSec: number | null;
};

export type WorkoutDTO = {
  id: string;
  name: string;
  description: string | null;
  type: string | null;
  tags: string | null;
  ownerCustomerId: string | null;
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
    tag: r!.tag,
    groupKey: r!.groupKey,
    groupTimeSec: r!.groupTimeSec,
  };
}

export async function listWorkouts(_ctx: Ctx) {
  return db.workout.findMany({
    orderBy: { createdAt: "desc" },
    include: {
      items: { orderBy: { order: "asc" } },
      classes: true,
    },
  });
}

/** All distinct tags used across the workout library, for the tag picker. */
export async function listWorkoutTags(): Promise<string[]> {
  const rows = await db.workout.findMany({ select: { tags: true } });
  const set = new Set<string>();
  for (const r of rows) (r.tags ?? "").split(",").map((t) => t.trim()).filter(Boolean).forEach((t) => set.add(t));
  return [...set].sort((a, b) => a.localeCompare(b));
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
    type: w.type,
    tags: w.tags,
    ownerCustomerId: w.ownerCustomerId,
    items: w.items.map(toItemDTO),
  };
}

/**
 * Atomic batch save: updates workout meta + tags and replaces ALL items
 * with the provided ordered list. Used by the editor's Save button.
 */
export async function saveWorkout(
  ctx: Ctx,
  id: string,
  input: { name: string; description?: string | null; type?: string | null; tags?: string | null; items: WorkoutItemInput[] }
) {
  await assertCanEditWorkout(ctx, id);
  await db.$transaction([
    db.workout.update({
      where: { id },
      data: {
        name: input.name.trim() || "Untitled workout",
        description: input.description?.trim() || null,
        type: input.type?.trim() || null,
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
        tag: it.tag ?? null,
        groupKey: it.groupKey ?? null,
        groupTimeSec: it.groupTimeSec ?? null,
      })),
    }),
  ]);
  bust(id);
}

/**
 * Adjust the exercises of a workout *as used by one class* (copy-on-write).
 *
 * If the workout is shared (assigned to other classes, or part of a camp's
 * workout pool), we clone it into a class-specific copy and re-point this
 * class at the clone — so other classes/camps keep the original. If the
 * workout is only used by this class, we edit it in place.
 *
 * Returns the effective workout id (the clone's id when a copy was made).
 */
export async function adjustClassWorkout(
  _ctx: Ctx,
  classId: string,
  workoutId: string,
  items: WorkoutItemInput[]
): Promise<{ workoutId: string; cloned: boolean }> {
  const orig = await db.workout.findUnique({ where: { id: workoutId } });
  if (!orig) throw new Error("workout not found");

  // Shared = used by another class (workouts no longer attach to camps).
  const otherClassUses = await db.classWorkout.count({ where: { workoutId, NOT: { classId } } });
  const shared = otherClassUses > 0;

  if (!shared) {
    await saveWorkout(_ctx, workoutId, {
      name: orig.name,
      description: orig.description,
      type: orig.type,
      tags: orig.tags,
      items,
    });
    return { workoutId, cloned: false };
  }

  const clone = await db.workout.create({
    data: {
      name: orig.name.includes("(adjusted)") ? orig.name : `${orig.name} (adjusted)`,
      description: orig.description,
      type: orig.type,
      tags: orig.tags,
      items: {
        create: items.map((it, i) => ({
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
          tag: it.tag ?? null,
          groupKey: it.groupKey ?? null,
          groupTimeSec: it.groupTimeSec ?? null,
        })),
      },
    },
  });

  const link = await db.classWorkout.findFirst({ where: { classId, workoutId } });
  if (link) await db.classWorkout.update({ where: { id: link.id }, data: { workoutId: clone.id } });
  revalidatePath(`/classes/${classId}`);
  return { workoutId: clone.id, cloned: true };
}

/** Deep-copy a workout (name + " (copy)", description, tags, all exercises),
 *  preserving its owner. Returns the new workout id. */
export async function cloneWorkout(_ctx: Ctx, workoutId: string): Promise<{ id: string }> {
  const orig = await db.workout.findUnique({
    where: { id: workoutId },
    include: { items: { orderBy: { order: "asc" } } },
  });
  if (!orig) throw new Error("workout not found");
  const copy = await db.workout.create({
    data: {
      name: `${orig.name} (copy)`,
      description: orig.description,
      type: orig.type,
      tags: orig.tags,
      ownerCustomerId: orig.ownerCustomerId,
      items: {
        create: orig.items.map((it, i) => ({
          order: i,
          category: it.category,
          label: it.label,
          distanceM: it.distanceM,
          timeSec: it.timeSec,
          weightKg: it.weightKg,
          reps: it.reps,
          sets: it.sets,
          paceSecPerKm: it.paceSecPerKm,
          heightM: it.heightM,
          notes: it.notes,
          tag: it.tag,
          groupKey: it.groupKey,
          groupTimeSec: it.groupTimeSec,
        })),
      },
    },
    select: { id: true },
  });
  bust();
  return copy;
}

export async function createWorkout(_ctx: Ctx, input: { name: string; description?: string | null; type?: string | null }) {
  const w = await db.workout.create({
    data: { name: input.name.trim(), description: input.description?.trim() || null, type: input.type?.trim() || null },
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

export async function deleteWorkout(ctx: Ctx, id: string) {
  await assertCanEditWorkout(ctx, id);
  await db.workout.delete({ where: { id } });
  bust();
}

// Per-item mutations were replaced by the atomic saveWorkout() above.
// The editor edits a local draft and persists everything in one PUT.

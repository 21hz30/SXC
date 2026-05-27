import { NextRequest } from "next/server";
import { db } from "@/lib/db";
import { requireUser } from "@/lib/auth";
import { revalidatePath } from "next/cache";
import { adjustClassWorkout } from "@/domain/workouts";
import type { WorkoutItemInput } from "@/domain/exercises";

// PUT /api/class/[id]/workouts/[workoutId] → adjust this class's exercises
// (copy-on-write: clones a shared workout so other classes are untouched).
export async function PUT(req: NextRequest, { params }: { params: Promise<{ id: string; workoutId: string }> }) {
  const user = await requireUser();
  const { id, workoutId } = await params;
  const body = (await req.json()) as { items: WorkoutItemInput[] };
  const result = await adjustClassWorkout({ user }, id, workoutId, body.items ?? []);
  const cls = await db.class.findUnique({ where: { id }, select: { campId: true } });
  revalidatePath(`/classes/${id}`);
  if (cls?.campId) revalidatePath(`/camps/${cls.campId}`);
  return Response.json({ ok: true, ...result });
}

// DELETE /api/class/[id]/workouts/[workoutId] → remove a workout from the class
export async function DELETE(_req: NextRequest, { params }: { params: Promise<{ id: string; workoutId: string }> }) {
  await requireUser();
  const { id, workoutId } = await params;
  await db.classWorkout.deleteMany({ where: { classId: id, workoutId } });
  const cls = await db.class.findUnique({ where: { id }, select: { campId: true } });
  revalidatePath(`/classes/${id}`);
  if (cls?.campId) revalidatePath(`/camps/${cls.campId}`);
  return Response.json({ ok: true });
}

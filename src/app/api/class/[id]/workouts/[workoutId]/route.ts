import { NextRequest } from "next/server";
import { db } from "@/lib/db";
import { requireUser, requireStaff } from "@/lib/auth";
import { revalidatePath } from "next/cache";
import { adjustClassWorkout } from "@/domain/workouts";
import type { WorkoutItemInput } from "@/domain/exercises";

// PATCH /api/class/[id]/workouts/[workoutId] → update this attachment's round count
export async function PATCH(req: NextRequest, { params }: { params: Promise<{ id: string; workoutId: string }> }) {
  await requireStaff();
  const { id, workoutId } = await params;
  const body = (await req.json().catch(() => ({}))) as { rounds?: number };
  if (body.rounds !== undefined) {
    const rounds = Math.max(1, Math.min(50, Math.floor(Number(body.rounds) || 1)));
    await db.classWorkout.updateMany({ where: { classId: id, workoutId }, data: { rounds } });
  }
  const cls = await db.class.findUnique({ where: { id }, select: { campId: true } });
  revalidatePath(`/classes/${id}`);
  if (cls?.campId) revalidatePath(`/camps/${cls.campId}`);
  return Response.json({ ok: true });
}

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

import { NextRequest } from "next/server";
import { db } from "@/lib/db";
import { requireStaff } from "@/lib/auth";
import { canManageClass } from "@/lib/access";
import { revalidatePath } from "next/cache";
import { adjustClassWorkout } from "@/domain/workouts";
import type { WorkoutItemInput } from "@/domain/exercises";

async function manageableClass(staff: Awaited<ReturnType<typeof requireStaff>>, id: string) {
  const cls = await db.class.findUnique({
    where: { id },
    select: {
      campId: true,
      createdById: true,
      camp: { select: { id: true, coachId: true, createdById: true } },
    },
  });
  if (!cls) return { response: Response.json({ ok: false, message: "class not found" }, { status: 404 }) };
  if (!canManageClass(staff, cls)) return { response: Response.json({ ok: false, message: "forbidden" }, { status: 403 }) };
  return { cls };
}

// PATCH /api/class/[id]/workouts/[workoutId] → update this attachment's round count
export async function PATCH(req: NextRequest, { params }: { params: Promise<{ id: string; workoutId: string }> }) {
  const staff = await requireStaff();
  const { id, workoutId } = await params;
  const checked = await manageableClass(staff, id);
  if (checked.response) return checked.response;
  const body = (await req.json().catch(() => ({}))) as { rounds?: number };
  if (body.rounds !== undefined) {
    const rounds = Math.max(1, Math.min(50, Math.floor(Number(body.rounds) || 1)));
    await db.classWorkout.updateMany({ where: { classId: id, workoutId }, data: { rounds } });
  }
  revalidatePath(`/classes/${id}`);
  if (checked.cls?.campId) revalidatePath(`/camps/${checked.cls.campId}`);
  return Response.json({ ok: true });
}

// PUT /api/class/[id]/workouts/[workoutId] → adjust this class's exercises
// (copy-on-write: clones a shared workout so other classes are untouched).
export async function PUT(req: NextRequest, { params }: { params: Promise<{ id: string; workoutId: string }> }) {
  const user = await requireStaff();
  const { id, workoutId } = await params;
  const checked = await manageableClass(user, id);
  if (checked.response) return checked.response;
  const link = await db.classWorkout.findUnique({
    where: { classId_workoutId: { classId: id, workoutId } },
    select: { id: true },
  });
  if (!link) return Response.json({ ok: false, message: "workout not attached to class" }, { status: 404 });
  const body = (await req.json()) as { items: WorkoutItemInput[] };
  const result = await adjustClassWorkout({ user }, id, workoutId, body.items ?? []);
  revalidatePath(`/classes/${id}`);
  if (checked.cls?.campId) revalidatePath(`/camps/${checked.cls.campId}`);
  return Response.json({ ok: true, ...result });
}

// DELETE /api/class/[id]/workouts/[workoutId] → remove a workout from the class
export async function DELETE(_req: NextRequest, { params }: { params: Promise<{ id: string; workoutId: string }> }) {
  const staff = await requireStaff();
  const { id, workoutId } = await params;
  const checked = await manageableClass(staff, id);
  if (checked.response) return checked.response;
  await db.classWorkout.deleteMany({ where: { classId: id, workoutId } });
  revalidatePath(`/classes/${id}`);
  if (checked.cls?.campId) revalidatePath(`/camps/${checked.cls.campId}`);
  return Response.json({ ok: true });
}

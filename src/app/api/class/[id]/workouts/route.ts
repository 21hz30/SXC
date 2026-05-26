import { NextRequest } from "next/server";
import { db } from "@/lib/db";
import { requireUser } from "@/lib/auth";
import { revalidatePath } from "next/cache";

// POST /api/class/[id]/workouts  { workoutId } → add a workout to the class
export async function POST(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  await requireUser();
  const { id } = await params;
  const { workoutId } = (await req.json()) as { workoutId: string };
  if (!workoutId) return Response.json({ ok: false, message: "workoutId required" }, { status: 400 });

  const exists = await db.classWorkout.findUnique({
    where: { classId_workoutId: { classId: id, workoutId } },
  });
  if (exists) return Response.json({ ok: true, alreadyLinked: true });

  const last = await db.classWorkout.findFirst({ where: { classId: id }, orderBy: { order: "desc" } });
  await db.classWorkout.create({ data: { classId: id, workoutId, order: (last?.order ?? -1) + 1 } });
  const cls = await db.class.findUnique({ where: { id }, select: { campId: true } });
  revalidatePath(`/classes/${id}`);
  if (cls?.campId) revalidatePath(`/camps/${cls.campId}`);
  return Response.json({ ok: true });
}

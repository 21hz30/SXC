import { NextRequest } from "next/server";
import { db } from "@/lib/db";
import { requireStaff } from "@/lib/auth";
import { revalidatePath } from "next/cache";
import type { WorkoutItemInput } from "@/domain/exercises";

// POST /api/class/[id]/workouts
//   { workoutId }                        → link an existing library workout
//   { name, description?, items: [...] } → create a NEW shared workout (with its
//                                          exercises) and link it, in one step
export async function POST(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  await requireStaff();
  const { id } = await params;
  const body = (await req.json()) as
    | { workoutId: string }
    | { name: string; description?: string | null; items?: WorkoutItemInput[] };

  let workoutId: string | undefined = (body as { workoutId?: string }).workoutId;

  // Create-with-items branch: build the workout (and its exercises) up front.
  if (!workoutId && "name" in body) {
    const name = String(body.name ?? "").trim();
    if (!name) return Response.json({ ok: false, message: "name required" }, { status: 400 });
    const items = Array.isArray(body.items) ? body.items : [];
    const created = await db.workout.create({
      data: {
        name,
        description: (body.description ?? "").toString().trim() || null,
        ownerCustomerId: null, // shared library workout
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
          })),
        },
      },
      select: { id: true },
    });
    workoutId = created.id;
  }

  if (!workoutId) return Response.json({ ok: false, message: "workoutId or name required" }, { status: 400 });

  const exists = await db.classWorkout.findUnique({
    where: { classId_workoutId: { classId: id, workoutId } },
  });
  if (!exists) {
    const last = await db.classWorkout.findFirst({ where: { classId: id }, orderBy: { order: "desc" } });
    await db.classWorkout.create({ data: { classId: id, workoutId, order: (last?.order ?? -1) + 1 } });
  }
  const cls = await db.class.findUnique({ where: { id }, select: { campId: true } });
  revalidatePath(`/classes/${id}`);
  if (cls?.campId) revalidatePath(`/camps/${cls.campId}`);
  return Response.json({ ok: true, workoutId });
}

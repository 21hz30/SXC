import { NextRequest } from "next/server";
import { db } from "@/lib/db";
import { requireStaff } from "@/lib/auth";
import { canManageClass, canUseLibraryWorkout } from "@/lib/access";
import { revalidatePath } from "next/cache";
import { cloneWorkout } from "@/domain/workouts";
import type { WorkoutItemInput } from "@/domain/exercises";

// POST /api/class/[id]/workouts
//   { workoutId }                               → link an existing library workout
//   { duplicateOf }                             → clone a workout + link the copy
//   { name, description?, tags?, items: [...] } → create a NEW shared workout
//                                                 (with its exercises) and link it
export async function POST(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const staff = await requireStaff();
  const { id } = await params;
  const cls = await db.class.findUnique({
    where: { id },
    select: {
      campId: true,
      createdById: true,
      camp: { select: { id: true, coachId: true, createdById: true } },
    },
  });
  if (!cls) return Response.json({ ok: false, message: "class not found" }, { status: 404 });
  if (!canManageClass(staff, cls)) return Response.json({ ok: false, message: "forbidden" }, { status: 403 });

  const body = (await req.json()) as
    | { workoutId: string }
    | { duplicateOf: string }
    | { name: string; description?: string | null; tags?: string | null; items?: WorkoutItemInput[] };

  let workoutId: string | undefined = (body as { workoutId?: string }).workoutId;

  // Duplicate branch: deep-copy an existing workout, then link the copy.
  const duplicateOf = (body as { duplicateOf?: string }).duplicateOf;
  if (!workoutId && duplicateOf) {
    const source = await db.workout.findUnique({
      where: { id: duplicateOf },
      select: { ownerCustomerId: true, tenantId: true },
    });
    if (!source || !canUseLibraryWorkout(staff, source)) {
      return Response.json({ ok: false, message: "workout not found" }, { status: 404 });
    }
    const copy = await cloneWorkout({ user: staff }, duplicateOf);
    workoutId = copy.id;
  }

  // Create-with-items branch: build the workout (and its exercises) up front.
  if (!workoutId && "name" in body) {
    const name = String(body.name ?? "").trim();
    if (!name) return Response.json({ ok: false, message: "name required" }, { status: 400 });
    const items = Array.isArray(body.items) ? body.items : [];
    const created = await db.workout.create({
      data: {
        name,
        description: (body.description ?? "").toString().trim() || null,
        tags: (body.tags ?? "").toString().trim() || null,
        ownerCustomerId: null, // shared library workout
        tenantId: staff.role === "coach" ? staff.tenantId : null,
        createdByUserId: staff.id,
        visibility: staff.role === "coach" ? "team" : "private",
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
            groupRounds: it.groupRounds ?? null,
          })),
        },
      },
      select: { id: true },
    });
    workoutId = created.id;
  }

  if (!workoutId) return Response.json({ ok: false, message: "workoutId or name required" }, { status: 400 });
  const workout = await db.workout.findUnique({
    where: { id: workoutId },
    select: { ownerCustomerId: true, tenantId: true },
  });
  if (!workout || !canUseLibraryWorkout(staff, workout)) {
    return Response.json({ ok: false, message: "workout not found" }, { status: 404 });
  }

  const exists = await db.classWorkout.findUnique({
    where: { classId_workoutId: { classId: id, workoutId } },
  });
  if (!exists) {
    const last = await db.classWorkout.findFirst({ where: { classId: id }, orderBy: { order: "desc" } });
    await db.classWorkout.create({ data: { classId: id, workoutId, order: (last?.order ?? -1) + 1 } });
  }
  revalidatePath(`/classes/${id}`);
  if (cls?.campId) revalidatePath(`/camps/${cls.campId}`);
  return Response.json({ ok: true, workoutId });
}

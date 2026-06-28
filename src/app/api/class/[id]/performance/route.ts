import { NextRequest } from "next/server";
import { requireStaff } from "@/lib/auth";
import { db } from "@/lib/db";
import { canManageClass } from "@/lib/access";
import { upsertPerformance } from "@/domain/performance";

// PATCH /api/class/[id]/performance  { customerId, ...fields }
export async function PATCH(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const user = await requireStaff();
  const { id } = await params;
  const body = (await req.json()) as { customerId: string; workoutId?: string | null } & Record<string, unknown>;
  if (!body.customerId) return Response.json({ ok: false, message: "customerId required" }, { status: 400 });
  const { customerId, workoutId = null, ...fields } = body;
  const cls = await db.class.findUnique({
    where: { id },
    select: {
      createdById: true,
      camp: { select: { id: true, coachId: true, createdById: true } },
      roster: { where: { customerId }, select: { id: true }, take: 1 },
      workouts: workoutId ? { where: { workoutId }, select: { id: true }, take: 1 } : false,
    },
  });
  if (!cls) return Response.json({ ok: false, message: "class not found" }, { status: 404 });
  if (!canManageClass(user, cls)) return Response.json({ ok: false, message: "forbidden" }, { status: 403 });
  if (cls.roster.length === 0) return Response.json({ ok: false, message: "athlete is not on this class roster" }, { status: 403 });
  if (workoutId && cls.workouts.length === 0) return Response.json({ ok: false, message: "workout is not attached to this class" }, { status: 403 });
  await upsertPerformance({ user }, id, customerId, workoutId ?? null, fields);
  return Response.json({ ok: true });
}

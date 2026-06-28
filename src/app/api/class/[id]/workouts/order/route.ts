import { NextRequest } from "next/server";
import { db } from "@/lib/db";
import { requireStaff } from "@/lib/auth";
import { canManageClass } from "@/lib/access";
import { revalidatePath } from "next/cache";

// PUT /api/class/[id]/workouts/order  { order: workoutId[] }
// Persist the drag-reordered sequence of this class's workouts.
export async function PUT(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
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

  const { order } = (await req.json().catch(() => ({}))) as { order?: string[] };
  if (!Array.isArray(order)) return Response.json({ ok: false, message: "order array required" }, { status: 400 });

  // Sequential updates (not a $transaction) — the Supabase transaction pooler
  // can't reliably start an interactive transaction; reorder is idempotent.
  for (let i = 0; i < order.length; i++) {
    await db.classWorkout.updateMany({ where: { classId: id, workoutId: order[i] }, data: { order: i } });
  }
  revalidatePath(`/classes/${id}`);
  if (cls?.campId) revalidatePath(`/camps/${cls.campId}`);
  return Response.json({ ok: true });
}

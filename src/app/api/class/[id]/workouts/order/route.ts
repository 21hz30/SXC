import { NextRequest } from "next/server";
import { db } from "@/lib/db";
import { requireStaff } from "@/lib/auth";
import { revalidatePath } from "next/cache";

// PUT /api/class/[id]/workouts/order  { order: workoutId[] }
// Persist the drag-reordered sequence of this class's workouts.
export async function PUT(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  await requireStaff();
  const { id } = await params;
  const { order } = (await req.json().catch(() => ({}))) as { order?: string[] };
  if (!Array.isArray(order)) return Response.json({ ok: false, message: "order array required" }, { status: 400 });

  // Sequential updates (not a $transaction) — the Supabase transaction pooler
  // can't reliably start an interactive transaction; reorder is idempotent.
  for (let i = 0; i < order.length; i++) {
    await db.classWorkout.updateMany({ where: { classId: id, workoutId: order[i] }, data: { order: i } });
  }
  const cls = await db.class.findUnique({ where: { id }, select: { campId: true } });
  revalidatePath(`/classes/${id}`);
  if (cls?.campId) revalidatePath(`/camps/${cls.campId}`);
  return Response.json({ ok: true });
}

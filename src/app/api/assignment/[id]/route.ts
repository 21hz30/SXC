import { NextRequest } from "next/server";
import { requireUser } from "@/lib/auth";
import { db } from "@/lib/db";
import { revalidatePath } from "next/cache";

/** The signed-in athlete's own customer id, or null. */
async function callerCustomerId(): Promise<string | null> {
  const u = await requireUser();
  const row = await db.user.findUnique({ where: { id: u.id }, select: { customerId: true } });
  return row?.customerId ?? null;
}

// PATCH /api/assignment/[id] — the OWNING athlete updates their plan workout:
//  - { toggleItemId, done }            → per-exercise check-in (merged into resultsJson)
//  - { status, rpe, feeling, notes }   → finalize / skip the session
// Scoped to `{ id, customerId: mine }` so a tampered id can't touch anyone else.
export async function PATCH(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const mine = await callerCustomerId();
  if (!mine) return Response.json({ ok: false, message: "no profile" }, { status: 400 });

  const a = await db.workoutAssignment.findFirst({
    where: { id, customerId: mine },
    select: { id: true, resultsJson: true, workout: { select: { items: { select: { id: true } } } } },
  });
  if (!a) return Response.json({ ok: false, message: "not found" }, { status: 404 });

  const body = (await req.json().catch(() => ({}))) as {
    toggleItemId?: string; done?: boolean;
    status?: string; rpe?: number | null; feeling?: string | null; notes?: string | null;
  };

  const results: Record<string, string> = a.resultsJson ? JSON.parse(a.resultsJson) : {};
  const data: Record<string, unknown> = {};

  if (typeof body.toggleItemId === "string" && body.toggleItemId) {
    if (body.done) results[body.toggleItemId] = "done";
    else delete results[body.toggleItemId];
    data.resultsJson = JSON.stringify(results);
  }
  if (body.rpe !== undefined) data.rpe = body.rpe === null ? null : Number(body.rpe);
  if (body.feeling !== undefined) data.feeling = body.feeling ? String(body.feeling) : null;
  if (body.notes !== undefined) data.notes = body.notes ? String(body.notes) : null;

  const itemIds = a.workout.items.map((i) => i.id);
  const doneCount = itemIds.filter((i) => results[i] === "done").length;

  if (body.status !== undefined) {
    // Explicit finalize / skip / reopen.
    data.status = String(body.status);
    data.completedAt = body.status === "completed" ? new Date() : null;
  } else if (body.toggleItemId !== undefined) {
    // Auto-complete once every exercise is ticked; otherwise keep it open.
    const allDone = itemIds.length > 0 && doneCount === itemIds.length;
    data.status = allDone ? "completed" : "assigned";
    data.completedAt = allDone ? new Date() : null;
  }

  await db.workoutAssignment.update({ where: { id: a.id }, data });
  revalidatePath("/");
  return Response.json({ ok: true, doneCount, total: itemIds.length });
}

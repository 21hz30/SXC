import { NextRequest } from "next/server";
import { requireUser, getMyCustomerId } from "@/lib/auth";
import { db } from "@/lib/db";

// POST /api/calendar/reschedule
// Body: { type: "assignment" | "class", id, date: "YYYY-MM-DD", time?: "HH:MM" }
// Moves a workout assignment to a different day, or a class to a different
// day/time (drag-and-drop on the calendar).
export async function POST(req: NextRequest) {
  const user = await requireUser();
  const isStaff = user.role === "admin" || user.role === "coach";
  const body = await req.json().catch(() => null);
  const type = body?.type;
  const id = typeof body?.id === "string" ? body.id : "";
  const date = typeof body?.date === "string" ? body.date : "";
  const time = typeof body?.time === "string" ? body.time : "";
  if (!id || !/^\d{4}-\d{2}-\d{2}$/.test(date)) {
    return Response.json({ ok: false, message: "bad request" }, { status: 400 });
  }

  if (type === "assignment") {
    const a = await db.workoutAssignment.findUnique({ where: { id }, select: { customerId: true } });
    if (!a) return Response.json({ ok: false, message: "not found" }, { status: 404 });
    // Owners move their own plan; staff can move anyone's.
    if (!isStaff) {
      const mine = await getMyCustomerId();
      if (a.customerId !== mine) return Response.json({ ok: false, message: "forbidden" }, { status: 403 });
    }
    await db.workoutAssignment.update({ where: { id }, data: { scheduledDate: new Date(date) } });
    return Response.json({ ok: true });
  }

  if (type === "class") {
    if (!isStaff) return Response.json({ ok: false, message: "forbidden" }, { status: 403 });
    const cls = await db.class.findUnique({ where: { id }, select: { startsAt: true } });
    if (!cls) return Response.json({ ok: false, message: "not found" }, { status: 404 });
    // Use the dropped time if given; otherwise keep the class's existing time-of-day.
    const hhmm = /^\d{2}:\d{2}$/.test(time)
      ? time
      : `${String(cls.startsAt.getHours()).padStart(2, "0")}:${String(cls.startsAt.getMinutes()).padStart(2, "0")}`;
    const startsAt = new Date(`${date}T${hhmm}`);
    if (isNaN(startsAt.getTime())) return Response.json({ ok: false, message: "bad time" }, { status: 400 });
    await db.class.update({ where: { id }, data: { startsAt } });
    return Response.json({ ok: true });
  }

  return Response.json({ ok: false, message: "bad type" }, { status: 400 });
}

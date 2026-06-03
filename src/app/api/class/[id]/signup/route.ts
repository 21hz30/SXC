import { NextRequest } from "next/server";
import { requireUser } from "@/lib/auth";
import { db } from "@/lib/db";

/** Resolve the caller's customer id, or null. */
async function callerCustomerId(): Promise<string | null> {
  const user = await requireUser();
  const u = await db.user.findUnique({ where: { id: user.id }, select: { customerId: true } });
  return u?.customerId ?? null;
}

// POST /api/class/[id]/signup — the current customer joins the class roster.
export async function POST(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const customerId = await callerCustomerId();
  if (!customerId) return Response.json({ ok: false, message: "no profile" }, { status: 400 });

  const cls = await db.class.findUnique({
    where: { id },
    select: { campId: true, dropInAllowed: true, capacity: true, _count: { select: { roster: true } } },
  });
  if (!cls) return Response.json({ ok: false, message: "class not found" }, { status: 404 });

  // Access: drop-in / free-standing is open; a camp class needs active membership.
  let allowed = !cls.campId || cls.dropInAllowed;
  if (!allowed && cls.campId) {
    const mem = await db.campMember.findFirst({
      where: { campId: cls.campId, customerId, status: "active" },
      select: { id: true },
    });
    allowed = !!mem;
  }
  if (!allowed) return Response.json({ ok: false, message: "not eligible" }, { status: 403 });

  const existing = await db.rosterEntry.findUnique({
    where: { classId_customerId: { classId: id, customerId } },
    select: { id: true },
  });
  if (existing) return Response.json({ ok: true, signedUp: true });
  if (cls._count.roster >= cls.capacity) {
    return Response.json({ ok: false, message: "class full" }, { status: 409 });
  }
  await db.rosterEntry.create({ data: { classId: id, customerId } });
  return Response.json({ ok: true, signedUp: true });
}

// DELETE /api/class/[id]/signup — the current customer drops the class.
export async function DELETE(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const customerId = await callerCustomerId();
  if (!customerId) return Response.json({ ok: false, message: "no profile" }, { status: 400 });
  await db.rosterEntry.deleteMany({ where: { classId: id, customerId } });
  return Response.json({ ok: true, signedUp: false });
}

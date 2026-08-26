import { NextRequest } from "next/server";
import { requireUser } from "@/lib/auth";
import { db } from "@/lib/db";
import { isUniqueConstraintError, normalizePhone } from "@/lib/phone";

// POST /api/me/phone — body: { phone } → save the caller's own contact number.
// Backs the "add your phone" prompt shown to athletes whose profile has none.
export async function POST(req: NextRequest) {
  const user = await requireUser();
  const u = await db.user.findUnique({ where: { id: user.id }, select: { customerId: true } });
  if (!u?.customerId) return Response.json({ ok: false, message: "no profile" }, { status: 400 });

  const body = (await req.json().catch(() => ({}))) as { phone?: string };
  const phone = String(body.phone ?? "").trim();
  const phoneNormalized = normalizePhone(phone);
  if (!phoneNormalized) {
    return Response.json({ ok: false, message: "Enter a valid phone number." }, { status: 400 });
  }

  try {
    await db.$transaction([
      db.customer.update({ where: { id: u.customerId }, data: { phone, phoneNormalized } }),
      db.accountAuditLog.create({
        data: { action: "PHONE_UPDATED", actorUserId: user.id, targetUserId: user.id, targetCustomerId: u.customerId },
      }),
    ]);
  } catch (error) {
    if (isUniqueConstraintError(error)) {
      return Response.json({ ok: false, message: "That phone number is already used by another account." }, { status: 409 });
    }
    throw error;
  }
  return Response.json({ ok: true });
}

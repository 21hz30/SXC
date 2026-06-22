import { NextRequest } from "next/server";
import { requireUser } from "@/lib/auth";
import { db } from "@/lib/db";

// POST /api/me/phone — body: { phone } → save the caller's own contact number.
// Backs the "add your phone" prompt shown to athletes whose profile has none.
export async function POST(req: NextRequest) {
  const user = await requireUser();
  const u = await db.user.findUnique({ where: { id: user.id }, select: { customerId: true } });
  if (!u?.customerId) return Response.json({ ok: false, message: "no profile" }, { status: 400 });

  const body = (await req.json().catch(() => ({}))) as { phone?: string };
  const phone = String(body.phone ?? "").trim();
  // Loose validation so international numbers work: 6–20 digits once symbols
  // (+, spaces, dashes, parens) are stripped.
  const digits = phone.replace(/\D/g, "");
  if (digits.length < 6 || digits.length > 20) {
    return Response.json({ ok: false, message: "Enter a valid phone number." }, { status: 400 });
  }

  await db.customer.update({ where: { id: u.customerId }, data: { phone } });
  return Response.json({ ok: true });
}

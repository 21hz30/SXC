import { db } from "@/lib/db";
import { normalizePhone } from "@/lib/phone";

export async function POST(req: Request) {
  const body = (await req.json().catch(() => ({}))) as { phone?: string };
  const phoneNormalized = normalizePhone(String(body.phone ?? ""));
  if (!phoneNormalized) {
    return Response.json({ message: "Enter a valid phone number." }, { status: 400 });
  }

  const profile = await db.customer.findUnique({
    where: { phoneNormalized },
    select: {
      deletedAt: true,
      userAccount: { select: { username: true, deletedAt: true } },
    },
  });

  if (!profile?.userAccount) return Response.json({ status: "not_found" });
  if (profile.deletedAt || profile.userAccount.deletedAt) {
    return Response.json({ status: "unavailable", username: profile.userAccount.username });
  }
  return Response.json({ status: "found", username: profile.userAccount.username });
}

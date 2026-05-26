import { db } from "@/lib/db";
import { requireUser } from "@/lib/auth";

export async function GET() {
  await requireUser();
  const rows = await db.customer.findMany({ orderBy: { name: "asc" }, select: { id: true, name: true } });
  return Response.json(rows);
}

import { db } from "@/lib/db";
import { requireUser } from "@/lib/auth";
import { customerScope } from "@/lib/access";

export async function GET() {
  const user = await requireUser();
  const rows = await db.customer.findMany({ where: customerScope(user), orderBy: { name: "asc" }, select: { id: true, name: true } });
  return Response.json(rows);
}

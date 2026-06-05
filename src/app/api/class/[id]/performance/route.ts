import { NextRequest } from "next/server";
import { requireStaff } from "@/lib/auth";
import { upsertPerformance } from "@/domain/performance";

// PATCH /api/class/[id]/performance  { customerId, ...fields }
export async function PATCH(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const user = await requireStaff();
  const { id } = await params;
  const body = (await req.json()) as { customerId: string; workoutId?: string | null } & Record<string, unknown>;
  if (!body.customerId) return Response.json({ ok: false, message: "customerId required" }, { status: 400 });
  const { customerId, workoutId = null, ...fields } = body;
  await upsertPerformance({ user }, id, customerId, workoutId ?? null, fields);
  return Response.json({ ok: true });
}

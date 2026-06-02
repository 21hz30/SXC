import { NextRequest } from "next/server";
import { requireUser } from "@/lib/auth";
import { upsertWatchData } from "@/domain/watch";

// PATCH /api/class/[id]/watch  { customerId, ...fields }
export async function PATCH(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const user = await requireUser();
  const { id } = await params;
  const body = (await req.json()) as { customerId: string } & Record<string, unknown>;
  if (!body.customerId) return Response.json({ ok: false, message: "customerId required" }, { status: 400 });
  const { customerId, ...fields } = body;
  await upsertWatchData({ user }, id, customerId, fields);
  return Response.json({ ok: true });
}

import { NextRequest } from "next/server";
import { requireUser } from "@/lib/auth";
import { listMessages } from "@/domain/chat";

export async function GET(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const user = await requireUser();
  const { id } = await params;
  return Response.json(await listMessages({ user }, id));
}

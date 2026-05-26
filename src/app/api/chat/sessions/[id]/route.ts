import { NextRequest } from "next/server";
import { requireUser } from "@/lib/auth";
import { renameSession, deleteSession } from "@/domain/chat";

export async function PATCH(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const user = await requireUser();
  const { id } = await params;
  const { title } = (await req.json()) as { title?: string };
  if (title) await renameSession({ user }, id, title);
  return Response.json({ ok: true });
}

export async function DELETE(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const user = await requireUser();
  const { id } = await params;
  await deleteSession({ user }, id);
  return Response.json({ ok: true });
}

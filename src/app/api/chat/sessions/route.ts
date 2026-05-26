import { NextRequest } from "next/server";
import { requireUser } from "@/lib/auth";
import { listSessions, createSession } from "@/domain/chat";

export async function GET() {
  const user = await requireUser();
  return Response.json(await listSessions({ user }));
}

export async function POST(req: NextRequest) {
  const user = await requireUser();
  const { title, customerId } = (await req.json().catch(() => ({}))) as {
    title?: string;
    customerId?: string | null;
  };
  const session = await createSession({ user }, { title, customerId });
  return Response.json(session);
}

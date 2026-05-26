import { NextRequest } from "next/server";
import { requireUser } from "@/lib/auth";
import { runAgent, type ChatTurn } from "@/agent/loop";
import { appendMessage, getSession } from "@/domain/chat";
import { db } from "@/lib/db";

async function buildCustomerContext(customerId: string): Promise<string | null> {
  const c = await db.customer.findUnique({
    where: { id: customerId },
    include: {
      benchmarks: { orderBy: { testedAt: "desc" }, take: 8 },
      campMembers: { include: { camp: { select: { name: true } } } },
    },
  });
  if (!c) return null;
  const benchmarks = c.benchmarks.map((b) => `  - ${b.metric}: ${b.value} ${b.unit}`).join("\n");
  const camps = c.campMembers.map((m) => m.camp.name).join(", ") || "—";
  return `This conversation is scoped to a specific athlete. When making recommendations,
tailor them to this athlete's profile and recent benchmarks.

Athlete profile:
- Name: ${c.name}
- Age: ${c.age ?? "—"}
- Weight: ${c.weightKg ?? "—"} kg
- Height: ${c.heightCm ?? "—"} cm
- Hyrox PB (sec): ${c.hyroxPbSec ?? "—"}
- Tags: ${c.tags ?? "—"}
- Camps: ${camps}
- Notes: ${c.notes ?? "—"}

Recent benchmarks:
${benchmarks || "  (none on file)"}`;
}

export async function POST(req: NextRequest) {
  const user = await requireUser();
  const ctx = { user };
  const { sessionId, messages } = (await req.json()) as { sessionId: string; messages: ChatTurn[] };

  if (!sessionId) return new Response("sessionId required", { status: 400 });
  const session = await getSession(ctx, sessionId);
  if (!session) return new Response("session not found", { status: 404 });

  const lastUser = messages[messages.length - 1];
  if (lastUser?.role === "user" && lastUser.content) {
    await appendMessage(ctx, sessionId, "user", lastUser.content);
  }

  const customerContext = session.customerId ? await buildCustomerContext(session.customerId) : null;

  const encoder = new TextEncoder();
  const stream = new ReadableStream({
    async start(controller) {
      let buffer = "";
      try {
        buffer = await runAgent({
          ctx,
          messages,
          customerContext,
          onChunk: (s) => controller.enqueue(encoder.encode(s)),
        });
      } catch (e) {
        const err = `\n\n[error: ${(e as Error).message}]`;
        buffer += err;
        controller.enqueue(encoder.encode(err));
      }
      if (buffer.trim()) await appendMessage(ctx, sessionId, "assistant", buffer).catch(() => {});
      controller.close();
    },
  });

  return new Response(stream, { headers: { "Content-Type": "text/plain; charset=utf-8" } });
}

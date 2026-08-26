import { db } from "@/lib/db";
import type { Ctx } from "./types";

export type ChatMessageDTO = { role: "user" | "assistant"; content: string };

export type ChatSessionDTO = {
  id: string;
  title: string;
  customerId: string | null;
  customerName: string | null;
  lastMessageAt: string;
  createdAt: string;
};

function autoTitleFromContent(content: string): string {
  const trimmed = content.trim().replace(/\s+/g, " ");
  if (trimmed.length <= 40) return trimmed || "New chat";
  return trimmed.slice(0, 40) + "…";
}

export async function listSessions(ctx: Ctx): Promise<ChatSessionDTO[]> {
  const rows = await db.chatSession.findMany({
    where: { userId: ctx.user.id },
    orderBy: { lastMessageAt: "desc" },
    include: { customer: { select: { name: true } } },
  });
  return rows.map((r) => ({
    id: r.id,
    title: r.title,
    customerId: r.customerId,
    customerName: r.customer?.name ?? null,
    lastMessageAt: r.lastMessageAt.toISOString(),
    createdAt: r.createdAt.toISOString(),
  }));
}

export async function getSession(ctx: Ctx, sessionId: string) {
  const s = await db.chatSession.findFirst({
    where: { id: sessionId, userId: ctx.user.id },
    include: { customer: true },
  });
  return s;
}

export async function createSession(
  ctx: Ctx,
  input: { title?: string; customerId?: string | null }
): Promise<ChatSessionDTO> {
  const customer = input.customerId
    ? await db.customer.findUnique({ where: { id: input.customerId, deletedAt: null }, select: { id: true, name: true } })
    : null;
  const title = input.title?.trim() || (customer ? `Chat about ${customer.name}` : "New chat");
  const s = await db.chatSession.create({
    data: { userId: ctx.user.id, title, customerId: customer?.id ?? null },
  });
  return {
    id: s.id,
    title: s.title,
    customerId: s.customerId,
    customerName: customer?.name ?? null,
    lastMessageAt: s.lastMessageAt.toISOString(),
    createdAt: s.createdAt.toISOString(),
  };
}

export async function renameSession(ctx: Ctx, sessionId: string, title: string) {
  const s = await db.chatSession.findFirst({ where: { id: sessionId, userId: ctx.user.id } });
  if (!s) throw new Error("not found");
  await db.chatSession.update({ where: { id: sessionId }, data: { title: title.trim() || s.title } });
}

export async function deleteSession(ctx: Ctx, sessionId: string) {
  const s = await db.chatSession.findFirst({ where: { id: sessionId, userId: ctx.user.id } });
  if (!s) return;
  await db.chatSession.delete({ where: { id: sessionId } });
}

export async function listMessages(ctx: Ctx, sessionId: string, take = 200): Promise<ChatMessageDTO[]> {
  // Verify ownership
  const owned = await db.chatSession.findFirst({ where: { id: sessionId, userId: ctx.user.id }, select: { id: true } });
  if (!owned) return [];
  const rows = await db.chatMessage.findMany({
    where: { sessionId },
    orderBy: { createdAt: "asc" },
    take,
  });
  return rows.map((r) => ({ role: r.role as "user" | "assistant", content: r.content }));
}

export async function appendMessage(
  ctx: Ctx,
  sessionId: string,
  role: "user" | "assistant",
  content: string
) {
  if (!content.trim()) return;
  const session = await db.chatSession.findFirst({
    where: { id: sessionId, userId: ctx.user.id },
    select: { id: true, title: true },
  });
  if (!session) throw new Error("session not found");
  await db.chatMessage.create({ data: { sessionId, role, content } });
  const updates: { lastMessageAt: Date; title?: string } = { lastMessageAt: new Date() };
  if (role === "user" && (session.title === "New chat" || session.title.startsWith("Chat about "))) {
    // Auto-title from first user message only if still default-ish AND not customer-scoped default
    if (session.title === "New chat") updates.title = autoTitleFromContent(content);
  }
  await db.chatSession.update({ where: { id: sessionId }, data: updates });
}

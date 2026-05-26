import { db } from "@/lib/db";
import { revalidatePath } from "next/cache";
import type { Ctx } from "./types";

export type TodoDTO = {
  id: string;
  title: string;
  dueDate: string | null;
  done: boolean;
  source: string;
};

function toDTO(t: Awaited<ReturnType<typeof db.todo.findFirst>>): TodoDTO {
  return {
    id: t!.id,
    title: t!.title,
    dueDate: t!.dueDate?.toISOString() ?? null,
    done: t!.done,
    source: t!.source,
  };
}

function bust() {
  revalidatePath("/");
  revalidatePath("/calendar");
}

export async function listTodos(ctx: Ctx): Promise<TodoDTO[]> {
  const rows = await db.todo.findMany({
    where: { ownerId: ctx.user.id },
    orderBy: [{ done: "asc" }, { dueDate: "asc" }, { createdAt: "desc" }],
  });
  return rows.map(toDTO);
}

export async function createTodo(
  ctx: Ctx,
  input: { title: string; dueDate?: Date | null; source?: string }
): Promise<TodoDTO> {
  const title = input.title.trim();
  if (!title) throw new Error("title is required");
  const todo = await db.todo.create({
    data: {
      ownerId: ctx.user.id,
      title,
      dueDate: input.dueDate ?? null,
      source: input.source ?? "manual",
    },
  });
  bust();
  return toDTO(todo);
}

export async function updateTodo(
  ctx: Ctx,
  id: string,
  input: { title?: string; dueDate?: Date | null }
): Promise<void> {
  const t = await db.todo.findUnique({ where: { id } });
  if (!t || t.ownerId !== ctx.user.id) throw new Error("not found");
  await db.todo.update({
    where: { id },
    data: {
      ...(input.title != null ? { title: input.title.trim() } : {}),
      ...(input.dueDate !== undefined ? { dueDate: input.dueDate } : {}),
    },
  });
  bust();
}

export async function toggleTodo(ctx: Ctx, id: string): Promise<void> {
  const t = await db.todo.findUnique({ where: { id } });
  if (!t || t.ownerId !== ctx.user.id) throw new Error("not found");
  await db.todo.update({ where: { id }, data: { done: !t.done } });
  bust();
}

export async function deleteTodo(ctx: Ctx, id: string): Promise<void> {
  const t = await db.todo.findUnique({ where: { id } });
  if (!t || t.ownerId !== ctx.user.id) throw new Error("not found");
  await db.todo.delete({ where: { id } });
  bust();
}

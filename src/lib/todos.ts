"use server";

import { db } from "./db";
import { requireUser } from "./auth";
import { revalidatePath } from "next/cache";

export async function createTodo(input: { title: string; dueDate?: Date | null; source?: string }) {
  const user = await requireUser();
  const todo = await db.todo.create({
    data: {
      ownerId: user.id,
      title: input.title.trim(),
      dueDate: input.dueDate ?? null,
      source: input.source ?? "manual",
    },
  });
  revalidatePath("/");
  revalidatePath("/calendar");
  return todo;
}

export async function toggleTodo(id: string) {
  const user = await requireUser();
  const t = await db.todo.findUnique({ where: { id } });
  if (!t || t.ownerId !== user.id) return;
  await db.todo.update({ where: { id }, data: { done: !t.done } });
  revalidatePath("/");
  revalidatePath("/calendar");
}

export async function updateTodo(id: string, input: { title?: string; dueDate?: Date | null }) {
  const user = await requireUser();
  const t = await db.todo.findUnique({ where: { id } });
  if (!t || t.ownerId !== user.id) return;
  await db.todo.update({
    where: { id },
    data: {
      ...(input.title != null ? { title: input.title.trim() } : {}),
      ...(input.dueDate !== undefined ? { dueDate: input.dueDate } : {}),
    },
  });
  revalidatePath("/");
  revalidatePath("/calendar");
}

export async function deleteTodo(id: string) {
  const user = await requireUser();
  const t = await db.todo.findUnique({ where: { id } });
  if (!t || t.ownerId !== user.id) return;
  await db.todo.delete({ where: { id } });
  revalidatePath("/");
  revalidatePath("/calendar");
}

// Form-action wrappers
export async function createTodoAction(formData: FormData) {
  const title = String(formData.get("title") ?? "").trim();
  if (!title) return;
  const dueStr = String(formData.get("dueDate") ?? "");
  await createTodo({ title, dueDate: dueStr ? new Date(dueStr) : null });
}

export async function toggleTodoAction(formData: FormData) {
  await toggleTodo(String(formData.get("id")));
}

export async function deleteTodoAction(formData: FormData) {
  await deleteTodo(String(formData.get("id")));
}

export async function updateTodoAction(formData: FormData) {
  const id = String(formData.get("id"));
  const title = String(formData.get("title") ?? "").trim();
  const dueStr = String(formData.get("dueDate") ?? "");
  await updateTodo(id, { title, dueDate: dueStr ? new Date(dueStr) : null });
}

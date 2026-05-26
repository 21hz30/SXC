import type { Tool } from "./types";
import { createTodo } from "@/domain/todos";

function resolveDate(s: string | undefined | null): Date | null {
  if (!s) return null;
  if (/^\d{4}-\d{2}-\d{2}$/.test(s)) return new Date(s);
  return null;
}

export const create_todo: Tool = {
  name: "create_todo",
  description:
    "Create a todo on the coach's todo list. Use whenever the user asks to add, remember, track, note, or schedule a task.",
  schema: {
    type: "object",
    properties: {
      title: { type: "string", description: "Short action-oriented title" },
      due_date: {
        type: "string",
        description: "ISO date YYYY-MM-DD, optional. Resolve 'today' / 'tomorrow' / weekdays to a concrete date.",
      },
    },
    required: ["title"],
  },
  parseSlash(rest) {
    let body = rest.trim();
    if (!body) return null;
    let dueDate: string | null = null;
    const dueMatch = body.match(/\bdue:(\d{4}-\d{2}-\d{2})\b/);
    if (dueMatch) {
      dueDate = dueMatch[1];
      body = body.replace(dueMatch[0], "").trim();
    } else if (/\btoday\b/i.test(body)) {
      dueDate = new Date().toISOString().slice(0, 10);
      body = body.replace(/\btoday\b/i, "").trim();
    } else if (/\btomorrow\b/i.test(body)) {
      const d = new Date();
      d.setDate(d.getDate() + 1);
      dueDate = d.toISOString().slice(0, 10);
      body = body.replace(/\btomorrow\b/i, "").trim();
    }
    return { title: body, due_date: dueDate ?? undefined };
  },
  async execute(ctx, input) {
    const title = String(input.title ?? "").trim();
    if (!title) return { ok: false, message: "title is required" };
    const dueDate = resolveDate(input.due_date as string | undefined);
    const todo = await createTodo(ctx, { title, dueDate, source: "ai" });
    const dueStr = todo.dueDate ? ` (due ${todo.dueDate.slice(0, 10)})` : "";
    return {
      ok: true,
      message: `Created todo: ${todo.title}${dueStr}`,
      data: { id: todo.id, title: todo.title, dueDate: todo.dueDate },
    };
  },
};

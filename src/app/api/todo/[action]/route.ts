import { NextRequest } from "next/server";
import { requireUser } from "@/lib/auth";
import { createTodo, toggleTodo, deleteTodo, updateTodo } from "@/domain/todos";

export async function POST(req: NextRequest, { params }: { params: Promise<{ action: string }> }) {
  const user = await requireUser();
  const ctx = { user };
  const { action } = await params;
  const fd = await req.formData();
  switch (action) {
    case "create": {
      const title = String(fd.get("title") ?? "").trim();
      const dueStr = String(fd.get("dueDate") ?? "");
      const todo = await createTodo(ctx, { title, dueDate: dueStr ? new Date(dueStr) : null });
      return Response.json(todo);
    }
    case "toggle":
      await toggleTodo(ctx, String(fd.get("id")));
      return Response.json({ ok: true });
    case "delete":
      await deleteTodo(ctx, String(fd.get("id")));
      return Response.json({ ok: true });
    case "update": {
      const id = String(fd.get("id"));
      const title = String(fd.get("title") ?? "").trim();
      const dueStr = String(fd.get("dueDate") ?? "");
      await updateTodo(ctx, id, { title, dueDate: dueStr ? new Date(dueStr) : null });
      return Response.json({ ok: true });
    }
    default:
      return new Response("unknown action", { status: 400 });
  }
}

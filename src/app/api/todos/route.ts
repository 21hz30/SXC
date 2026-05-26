import { requireUser } from "@/lib/auth";
import { listTodos } from "@/domain/todos";

export async function GET() {
  const user = await requireUser();
  const todos = await listTodos({ user });
  return Response.json(todos);
}

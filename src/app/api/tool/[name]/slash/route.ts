import { NextRequest } from "next/server";
import { getTool } from "@/tools/registry";
import { requireUser } from "@/lib/auth";

/**
 * Slash-command entrypoint. Receives the raw text AFTER the command word,
 * delegates parsing to the tool's parseSlash, then executes.
 */
export async function POST(req: NextRequest, { params }: { params: Promise<{ name: string }> }) {
  const user = await requireUser();
  const { name } = await params;
  const tool = getTool(name);
  if (!tool) return Response.json({ ok: false, message: `unknown tool: ${name}` }, { status: 404 });
  if (!tool.parseSlash) return Response.json({ ok: false, message: `${name} has no slash form` }, { status: 400 });

  const { rest } = (await req.json()) as { rest?: string };
  const input = tool.parseSlash(rest ?? "");
  if (!input) return Response.json({ ok: false, message: "Could not parse arguments" }, { status: 400 });

  const result = await tool.execute({ user }, input);
  return Response.json(result, { status: result.ok ? 200 : 400 });
}

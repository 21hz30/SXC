import { NextRequest } from "next/server";
import { getTool } from "@/tools/registry";
import { requireUser } from "@/lib/auth";

export async function POST(req: NextRequest, { params }: { params: Promise<{ name: string }> }) {
  const user = await requireUser();
  const { name } = await params;
  const tool = getTool(name);
  if (!tool) return new Response(`unknown tool: ${name}`, { status: 404 });

  let input: Record<string, unknown> = {};
  const ct = req.headers.get("content-type") ?? "";
  if (ct.includes("application/json")) {
    input = (await req.json()) as Record<string, unknown>;
  } else {
    const fd = await req.formData();
    for (const [k, v] of fd.entries()) input[k] = typeof v === "string" ? v : v.name;
  }

  const result = await tool.execute({ user }, input);
  return Response.json(result, { status: result.ok ? 200 : 400 });
}

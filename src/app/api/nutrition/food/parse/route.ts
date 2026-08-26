import { NextRequest } from "next/server";
import { requireUser, getMyCustomerId } from "@/lib/auth";
import { parseFoodWithAI } from "@/domain/foodlogs";
import { FEATURES } from "@/lib/features";

// POST /api/nutrition/food/parse — body: { description } → ParsedFood
// Called from the Log Meal form when the athlete taps "Estimate with AI".
export async function POST(req: NextRequest) {
  if (!FEATURES.nutrition) return Response.json({ error: "not found" }, { status: 404 });
  await requireUser();
  const mine = await getMyCustomerId();
  if (!mine) return Response.json({ error: "no customer profile" }, { status: 400 });
  const body = (await req.json().catch(() => ({}))) as { description?: string };
  const description = String(body.description ?? "").trim();
  if (!description) return Response.json({ error: "description required" }, { status: 400 });
  try {
    const parsed = await parseFoodWithAI(description);
    return Response.json(parsed);
  } catch (e) {
    return Response.json({ error: (e as Error).message || "AI parse failed" }, { status: 500 });
  }
}

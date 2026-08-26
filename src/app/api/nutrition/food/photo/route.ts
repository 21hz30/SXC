import { NextRequest } from "next/server";
import { requireUser, getMyCustomerId } from "@/lib/auth";
import { hasDedicatedVisionModel } from "@/lib/ai";
import { parseFoodFromImage, isSupportedFoodImageType } from "@/domain/foodlogs";
import { FEATURES } from "@/lib/features";

// POST /api/nutrition/food/photo — body: { imageBase64, mediaType } → ParsedFood
// Called from the Log Meal form's "Take a photo" button. The image is already
// resized + JPEG-compressed client-side; we cap the decoded size as a backstop.
const MAX_BASE64_CHARS = 8_000_000; // ~6 MB decoded

export async function POST(req: NextRequest) {
  if (!FEATURES.nutrition) return Response.json({ error: "not found" }, { status: 404 });
  await requireUser();
  const mine = await getMyCustomerId();
  if (!mine) return Response.json({ error: "no customer profile" }, { status: 400 });
  // Gate on a real vision model being configured (the UI also hides the button,
  // but a direct call shouldn't fall back to the text model, which can't see).
  if (!hasDedicatedVisionModel()) {
    return Response.json({ error: "Photo analysis isn't set up yet" }, { status: 503 });
  }

  const body = (await req.json().catch(() => ({}))) as { imageBase64?: string; mediaType?: string };
  const imageBase64 = String(body.imageBase64 ?? "");
  const mediaType = String(body.mediaType ?? "");
  if (!imageBase64) return Response.json({ error: "image required" }, { status: 400 });
  if (imageBase64.length > MAX_BASE64_CHARS) return Response.json({ error: "image too large" }, { status: 413 });
  if (!isSupportedFoodImageType(mediaType)) return Response.json({ error: "unsupported image type" }, { status: 415 });

  try {
    const parsed = await parseFoodFromImage(imageBase64, mediaType);
    return Response.json(parsed);
  } catch (e) {
    return Response.json({ error: (e as Error).message || "AI vision failed" }, { status: 500 });
  }
}

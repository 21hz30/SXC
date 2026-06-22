/**
 * Server-side helpers for the per-athlete food + water log.
 *
 * - `loadDayIntake` rolls everything an athlete logged TODAY into one shape
 *   the dashboard / nutrition page can render with `rollDay` from
 *   domain/nutrition.ts (no DB type leakage to client components).
 * - `parseFoodWithAI` takes a free-text meal description ("two eggs, oats,
 *   banana") and asks the AI for a clean description + macro estimate. The
 *   caller treats the result as an initial guess the athlete edits before
 *   saving — the nutrition logger is "AI suggests, you correct," same model
 *   as Calorify.
 *
 * - `parseFoodFromImage` does the same from a PHOTO, using the dedicated
 *   vision model (any Anthropic-compatible Messages API, e.g. SiliconFlow).
 */
import Anthropic from "@anthropic-ai/sdk";
import { db } from "@/lib/db";
import { getAIClient, getAIModel, getAIVisionClient, getAIVisionConfig } from "@/lib/ai";
import { getPrompt } from "./prompts";
import type { DayIntake } from "./nutrition";

/** Sum the day's logs into the shape `rollDay()` expects. */
export async function loadDayIntake(customerId: string, dayStart: Date, dayEnd: Date): Promise<DayIntake> {
  const [food, water, burn] = await Promise.all([
    db.foodLog.findMany({ where: { customerId, loggedAt: { gte: dayStart, lte: dayEnd } }, select: { calories: true, proteinG: true, carbsG: true, fatG: true, fiberG: true } }),
    db.waterLog.findMany({ where: { customerId, loggedAt: { gte: dayStart, lte: dayEnd } }, select: { amountMl: true } }),
    db.workoutAssignment.findMany({
      where: { customerId, scheduledDate: { gte: dayStart, lte: dayEnd }, status: "completed" },
      select: { caloriesBurned: true, workout: { select: { items: { select: { timeSec: true, groupTimeSec: true } } } } },
    }),
  ]);
  const exerciseMinutes = burn.reduce((sum, a) => {
    const itemSec = a.workout.items.reduce((s, it) => s + (it.timeSec ?? 0) + (it.groupTimeSec ?? 0), 0);
    return sum + Math.round(itemSec / 60);
  }, 0);
  return {
    caloriesIn: food.reduce((s, r) => s + (r.calories ?? 0), 0),
    proteinG: food.reduce((s, r) => s + (r.proteinG ?? 0), 0),
    carbsG: food.reduce((s, r) => s + (r.carbsG ?? 0), 0),
    fatG: food.reduce((s, r) => s + (r.fatG ?? 0), 0),
    fiberG: food.reduce((s, r) => s + (r.fiberG ?? 0), 0),
    waterMl: water.reduce((s, r) => s + r.amountMl, 0),
    caloriesOut: burn.reduce((s, r) => s + (r.caloriesBurned ?? 0), 0),
    exerciseMinutes,
  };
}

export type ParsedFood = {
  description: string;
  calories: number | null;
  proteinG: number | null;
  carbsG: number | null;
  fatG: number | null;
  fiberG: number | null;
  /** Raw text the model returned, so we can debug + store it. */
  raw: string;
  /** Which model produced this (for traceability). */
  model: string;
};

/** Strip code fences / leading prose and extract the first {...} block. */
function extractJson(raw: string): string {
  const fence = raw.match(/```(?:json)?\s*([\s\S]*?)```/);
  if (fence) return fence[1].trim();
  const i = raw.indexOf("{");
  const j = raw.lastIndexOf("}");
  if (i >= 0 && j > i) return raw.slice(i, j + 1);
  return raw.trim();
}

/**
 * Ask the AI to turn `description` into macros. Throws if the model is
 * unreachable; returns a partial object (some fields null) if the model
 * answered but didn't fill in every field.
 */
export async function parseFoodWithAI(description: string): Promise<ParsedFood> {
  const client = getAIClient();
  const model = getAIModel();
  // System prompt is editable from /admin/prompts (key: nutrition.foodParse).
  // Falls back to the bundled src/prompts/nutrition-food-parse.md on first run.
  const system = await getPrompt("nutrition.foodParse");
  // DeepSeek streams a `thinking` content block before the JSON output (a
  // chain-of-thought tax we don't see in Anthropic-native models). It eats a
  // few hundred tokens, so we give plenty of headroom — the actual JSON
  // payload itself is tiny.
  const resp = await client.messages.create({
    model,
    max_tokens: 2000,
    system,
    messages: [{ role: "user", content: description }],
  });
  return toParsedFood(textOf(resp), description, model);
}

// Allowed base64 image media types for the Anthropic image block.
const IMAGE_MEDIA_TYPES = ["image/jpeg", "image/png", "image/webp", "image/gif"] as const;
type ImageMediaType = (typeof IMAGE_MEDIA_TYPES)[number];
export function isSupportedFoodImageType(t: string): t is ImageMediaType {
  return (IMAGE_MEDIA_TYPES as readonly string[]).includes(t);
}

/**
 * Estimate a meal's macros from a PHOTO. Uses the dedicated vision model via the
 * Anthropic-compatible Messages API (image content block). Same JSON contract +
 * ParsedFood shape as the text parser, so the caller fills the same form fields.
 * Throws if the vision model is unreachable; the route handles that gracefully.
 */
export async function parseFoodFromImage(imageBase64: string, mediaType: ImageMediaType): Promise<ParsedFood> {
  const client = getAIVisionClient();
  const { model } = getAIVisionConfig();
  const system = await getPrompt("nutrition.foodParse");
  const resp = await client.messages.create({
    model,
    // Generous headroom: a reasoning ("thinking") vision model spends tokens
    // analysing the image before emitting the tiny JSON, so a low cap would
    // truncate the answer into invalid JSON and we'd lose every macro.
    max_tokens: 8000,
    system,
    messages: [
      {
        role: "user",
        content: [
          { type: "image", source: { type: "base64", media_type: mediaType, data: imageBase64 } },
          // Self-contained vision instruction so the (text-framed) system prompt
          // doesn't leave the model guessing — it carries the full task itself.
          {
            type: "text",
            text:
              "This is a PHOTO of a meal. Identify each food and drink you can see, then " +
              "estimate the TOTAL macros for the whole plate. Reply with ONLY the JSON " +
              "object from your instructions — `description` = the foods you see, and " +
              "calories / proteinG / carbsG / fatG / fiberG as numbers.",
          },
        ],
      },
    ],
  });
  return toParsedFood(textOf(resp), "Meal from photo", model);
}

/** Concatenate the text blocks of a Messages response. */
function textOf(resp: Anthropic.Messages.Message): string {
  return resp.content
    .filter((b): b is Anthropic.Messages.TextBlock => b.type === "text")
    .map((b) => b.text)
    .join("")
    .trim();
}

/**
 * Coerce the model's raw text into a ParsedFood: extract the JSON block and
 * pull the macro numbers, falling back to `fallbackDescription` (so the athlete
 * always gets *something* to edit even if the model didn't return clean JSON).
 * Shared by the text and photo parsers.
 */
function toParsedFood(raw: string, fallbackDescription: string, model: string): ParsedFood {
  let parsed: Partial<ParsedFood> = {};
  try {
    const o = JSON.parse(extractJson(raw)) as Record<string, unknown>;
    const num = (v: unknown): number | null => (typeof v === "number" && Number.isFinite(v) ? v : null);
    parsed = {
      description: typeof o.description === "string" && o.description.trim() ? o.description.trim() : fallbackDescription,
      calories: num(o.calories) != null ? Math.round(num(o.calories)!) : null,
      proteinG: num(o.proteinG),
      carbsG: num(o.carbsG),
      fatG: num(o.fatG),
      fiberG: num(o.fiberG),
    };
  } catch {
    parsed.description = fallbackDescription;
  }
  return {
    description: parsed.description ?? fallbackDescription,
    calories: parsed.calories ?? null,
    proteinG: parsed.proteinG ?? null,
    carbsG: parsed.carbsG ?? null,
    fatG: parsed.fatG ?? null,
    fiberG: parsed.fiberG ?? null,
    raw,
    model,
  };
}

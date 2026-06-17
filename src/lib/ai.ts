/**
 * Shared AI client + model resolution. Two flavours:
 *
 *   Text (default) — chat agent loop, post-class reports, customer insights.
 *     Uses AI_API_KEY / AI_BASE_URL / AI_MODEL with the Anthropic SDK.
 *
 *   Vision — food photo recognition in the nutrition logger (Phase 2).
 *     Uses AI_VISION_API_KEY / AI_VISION_BASE_URL / AI_VISION_MODEL. Falls
 *     back to the text vars when the vision-specific ones are unset, so the
 *     same endpoint is used until we wire Qwen (which has vision; DeepSeek
 *     does not). Returned via `getAIVisionConfig()`; the food route will pick
 *     the SDK (Qwen exposes an OpenAI-compatible /chat/completions endpoint).
 */
import Anthropic from "@anthropic-ai/sdk";

let _client: Anthropic | null = null;

export function getAIClient(): Anthropic {
  if (_client) return _client;
  const apiKey = process.env.AI_API_KEY;
  if (!apiKey) throw new Error("AI_API_KEY missing in .env");
  const baseURL = process.env.AI_BASE_URL;
  _client = new Anthropic({ apiKey, baseURL });
  return _client;
}

export function getAIModel(): string {
  return process.env.AI_MODEL ?? "deepseek-v4-pro";
}

/**
 * Config for the vision model. The food logger will read this to call a
 * vision-capable endpoint (e.g. Qwen-VL via DashScope's OpenAI-compatible
 * `/chat/completions`). Falls back to the text AI when the vision-specific
 * env vars are unset so callers don't blow up during early development.
 */
export function getAIVisionConfig(): { apiKey: string; baseURL: string | null; model: string } {
  const apiKey = process.env.AI_VISION_API_KEY ?? process.env.AI_API_KEY;
  if (!apiKey) throw new Error("AI_VISION_API_KEY or AI_API_KEY missing in .env");
  const baseURL = process.env.AI_VISION_BASE_URL ?? process.env.AI_BASE_URL ?? null;
  // Default model is what we'll switch to — qwen-vl-max via DashScope. Until
  // AI_VISION_MODEL is set we just use the text model so test calls don't crash.
  const model = process.env.AI_VISION_MODEL ?? process.env.AI_MODEL ?? "qwen-vl-max";
  return { apiKey, baseURL, model };
}

/** True when AI_VISION_* env vars are wired (and not just falling back). */
export function hasDedicatedVisionModel(): boolean {
  return !!process.env.AI_VISION_API_KEY && !!process.env.AI_VISION_MODEL;
}

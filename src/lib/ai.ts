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
 * Config for the vision model behind the food-photo macro estimator. Any
 * provider with an **Anthropic-compatible Messages API** works (e.g.
 * SiliconFlow's https://api.siliconflow.cn/v1/messages), so the same
 * `@anthropic-ai/sdk` client is reused — just with an image content block.
 * The MODEL must be vision-capable (a text/code model can't read images).
 * Falls back to the text AI vars so non-photo code paths don't crash.
 */
export function getAIVisionConfig(): { apiKey: string; baseURL: string | null; model: string } {
  const apiKey = process.env.AI_VISION_API_KEY ?? process.env.AI_API_KEY;
  if (!apiKey) throw new Error("AI_VISION_API_KEY or AI_API_KEY missing in .env");
  const baseURL = process.env.AI_VISION_BASE_URL ?? process.env.AI_BASE_URL ?? null;
  const model = process.env.AI_VISION_MODEL ?? process.env.AI_MODEL ?? "moonshotai/Kimi-VL-A3B-Thinking";
  return { apiKey, baseURL, model };
}

/**
 * True only when a DEDICATED vision model is wired (both key and model). The
 * UI gates the "Take a photo" button on this so it never appears when vision
 * would just fall back to the text model (which can't read images).
 */
export function hasDedicatedVisionModel(): boolean {
  return !!process.env.AI_VISION_API_KEY && !!process.env.AI_VISION_MODEL;
}

let _visionClient: Anthropic | null = null;

/** Anthropic SDK client pointed at the vision endpoint (cached per process). */
export function getAIVisionClient(): Anthropic {
  if (_visionClient) return _visionClient;
  const { apiKey, baseURL } = getAIVisionConfig();
  _visionClient = new Anthropic({ apiKey, baseURL: baseURL ?? undefined });
  return _visionClient;
}

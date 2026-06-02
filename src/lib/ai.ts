/**
 * Shared Anthropic client + model resolution. Both the chat agent loop and
 * the report generator go through here so AI_API_KEY / AI_BASE_URL / AI_MODEL
 * have exactly one source of truth.
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

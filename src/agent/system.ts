/**
 * The AI co-coach's system prompt. Editable from /admin/prompts (DB-backed),
 * with a fallback to `src/prompts/system.md` if the DB has no override yet.
 */
import { getPrompt } from "@/domain/prompts";

const FALLBACK_PROMPT =
  "You are SRC, an AI co-coach for hybrid training coaches. Keep replies concise and practical.";

export async function getSystemPrompt(): Promise<string> {
  const content = await getPrompt("chat.system");
  return content || FALLBACK_PROMPT;
}

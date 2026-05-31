/**
 * The AI co-coach's system prompt lives in `src/prompts/system.md` so a coach
 * (or anyone) can change the AI's behavior by editing a Markdown file — no
 * code change, no restart, takes effect on the very next chat turn.
 *
 * We read the file on every chat request. The file is tiny (~1 KB) so this is
 * effectively free; in exchange we get instant editability.
 */
import { readFile } from "fs/promises";
import path from "path";

const PROMPT_PATH = path.join(process.cwd(), "src", "prompts", "system.md");

const FALLBACK_PROMPT =
  "You are SXC, an AI co-coach for Hyrox coaches. Keep replies concise and practical.";

export async function getSystemPrompt(): Promise<string> {
  try {
    return await readFile(PROMPT_PATH, "utf-8");
  } catch {
    // If the file is missing for any reason, the chat keeps working.
    return FALLBACK_PROMPT;
  }
}

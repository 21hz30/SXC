/**
 * Editable AI prompts.
 *
 * Each prompt has a stable `key` referenced by code (e.g. `chat.system`,
 * `report.postClass`). Content is stored in the DB and edited from
 * `/admin/prompts`. On read, we look up the DB row first; if missing, we
 * fall back to the bundled `src/prompts/<file>.md` shipped with the repo
 * so the app keeps working on a freshly-migrated DB.
 *
 * Adding a new prompt = add an entry to `PROMPT_REGISTRY` and the file
 * fallback, then reference its key from your code.
 */
import { readFile } from "fs/promises";
import path from "path";
import { db } from "@/lib/db";
import { FEATURES } from "@/lib/features";

export type PromptKey = "chat.system" | "report.postClass" | "insights.customer" | "nutrition.foodParse";

type RegistryEntry = {
  name: string;
  description: string;
  file: string; // path under src/prompts/
};

export const PROMPT_REGISTRY: Record<PromptKey, RegistryEntry> = {
  "chat.system": {
    name: "Chat — system prompt",
    description:
      "Sets behavior for the AI co-coach chat sidebar. Used on every chat turn.",
    file: "system.md",
  },
  "report.postClass": {
    name: "Post-class report",
    description:
      "Generates the athlete-facing report after each class. Used by the 'Generate' button on the class detail page.",
    file: "post-class-report.md",
  },
  "insights.customer": {
    name: "Customer AI insights",
    description:
      "Produces the coach-facing insight cards (strengths, watch-outs, focus, nutrition) on a customer's profile. Must return JSON.",
    file: "customer-insights.md",
  },
  "nutrition.foodParse": {
    name: "Nutrition — food parse",
    description:
      "Tuned for athletes in China — turns a free-text meal description (Chinese or English) into a clean label + calories + macros. Used by the 'Estimate with AI' button on the meal log form. Must return strict JSON.",
    file: "nutrition-food-parse.md",
  },
};

const PROMPTS_DIR = path.join(process.cwd(), "src", "prompts");

async function readFallback(key: PromptKey): Promise<string> {
  const entry = PROMPT_REGISTRY[key];
  try {
    return await readFile(path.join(PROMPTS_DIR, entry.file), "utf-8");
  } catch {
    return "";
  }
}

/** Return the live prompt for `key`: DB row if present, else bundled file. */
export async function getPrompt(key: PromptKey): Promise<string> {
  const row = await db.prompt.findUnique({ where: { key } });
  if (row?.content) return row.content;
  return readFallback(key);
}

export type PromptListItem = {
  key: PromptKey;
  name: string;
  description: string;
  content: string;
  source: "db" | "file";
  updatedAt: Date | null;
  updatedById: string | null;
};

/** List all registered prompts with their current effective content. */
export async function listPrompts(): Promise<PromptListItem[]> {
  const rows = await db.prompt.findMany();
  const byKey = new Map(rows.map((r) => [r.key, r]));
  const out: PromptListItem[] = [];
  for (const key of Object.keys(PROMPT_REGISTRY) as PromptKey[]) {
    if (key === "nutrition.foodParse" && !FEATURES.nutrition) continue;
    const meta = PROMPT_REGISTRY[key];
    const row = byKey.get(key);
    out.push({
      key,
      name: meta.name,
      description: meta.description,
      content: row?.content ?? (await readFallback(key)),
      source: row ? "db" : "file",
      updatedAt: row?.updatedAt ?? null,
      updatedById: row?.updatedById ?? null,
    });
  }
  return out;
}

export async function getPromptForEdit(key: PromptKey): Promise<PromptListItem> {
  const items = await listPrompts();
  const found = items.find((p) => p.key === key);
  if (!found) throw new Error(`unknown prompt key: ${key}`);
  return found;
}

export async function savePrompt(
  key: PromptKey,
  content: string,
  updatedById: string,
): Promise<void> {
  const meta = PROMPT_REGISTRY[key];
  if (!meta) throw new Error(`unknown prompt key: ${key}`);
  await db.prompt.upsert({
    where: { key },
    create: {
      key,
      name: meta.name,
      description: meta.description,
      content,
      updatedById,
    },
    update: { content, updatedById },
  });
}

/** Reset a prompt back to the bundled file by deleting the DB override. */
export async function resetPrompt(key: PromptKey): Promise<void> {
  await db.prompt.deleteMany({ where: { key } });
}

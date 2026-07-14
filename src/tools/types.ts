import type { Ctx } from "@/domain/types";

export type ToolResult = {
  ok: boolean;
  message: string; // human-readable confirmation, shown in chat
  data?: Record<string, unknown>;
};

export type Tool = {
  name: string;
  description: string;
  schema: Record<string, unknown>; // JSON schema (for Anthropic tool_use)
  /**
   * Slash-command parser. Receives the raw text AFTER the command word
   * and returns parsed input ready for execute(), or null if it can't be parsed.
   */
  parseSlash?: (rest: string) => Record<string, unknown> | null;
  execute: (ctx: Ctx, input: Record<string, unknown>) => Promise<ToolResult>;
};

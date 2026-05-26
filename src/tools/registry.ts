import type { Tool } from "./types";
import { create_todo } from "./create_todo";

export const tools: Tool[] = [create_todo];

export function getTool(name: string): Tool | undefined {
  return tools.find((t) => t.name === name);
}

/**
 * Anthropic tool_use spec for the model.
 */
export function toAnthropicTools() {
  return tools.map((t) => ({
    name: t.name,
    description: t.description,
    input_schema: t.schema,
  }));
}

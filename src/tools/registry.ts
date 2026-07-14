import type { Tool } from "./types";

export const tools: Tool[] = [];

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

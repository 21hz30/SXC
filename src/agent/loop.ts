import Anthropic from "@anthropic-ai/sdk";
import { getSystemPrompt } from "./system";
import { tools, toAnthropicTools, getTool } from "@/tools/registry";
import { getAIClient, getAIModel } from "@/lib/ai";
import type { Ctx } from "@/domain/types";

export type ChatTurn = { role: "user" | "assistant"; content: string };

/**
 * Runs the agent: streams text to the caller, executes any tool_use blocks
 * by dispatching to the tools registry, and loops until the model is done.
 *
 * Returns the full assistant text emitted across all turns, so the caller
 * can persist it to chat history.
 */
export async function runAgent(opts: {
  ctx: Ctx;
  messages: ChatTurn[];
  customerContext?: string | null;
  onChunk: (s: string) => void;
  maxSteps?: number;
}): Promise<string> {
  const { ctx, messages, onChunk, customerContext } = opts;
  const maxSteps = opts.maxSteps ?? 4;
  const basePrompt = await getSystemPrompt();
  const system = customerContext ? `${basePrompt}\n\n---\n\n${customerContext}` : basePrompt;

  const client = getAIClient();
  const model = getAIModel();

  const convo: Anthropic.Messages.MessageParam[] = messages.map((m) => ({
    role: m.role === "user" ? "user" : "assistant",
    content: m.content,
  }));

  let assistantBuffer = "";

  for (let step = 0; step < maxSteps; step++) {
    const stream = client.messages.stream({
      model,
      max_tokens: 1024,
      system,
      tools: toAnthropicTools() as unknown as Anthropic.Messages.Tool[],
      messages: convo,
    });

    // Stream text deltas as they arrive (token-by-token).
    for await (const event of stream) {
      if (event.type === "content_block_delta" && event.delta.type === "text_delta") {
        const t = event.delta.text;
        assistantBuffer += t;
        onChunk(t);
      }
    }

    const resp = await stream.finalMessage();

    if (resp.stop_reason !== "tool_use") break;

    convo.push({ role: "assistant", content: resp.content });

    const results: Anthropic.Messages.ToolResultBlockParam[] = [];
    for (const block of resp.content) {
      if (block.type !== "tool_use") continue;
      const tool = getTool(block.name);
      try {
        if (!tool) throw new Error(`unknown tool: ${block.name}`);
        const result = await tool.execute(ctx, block.input as Record<string, unknown>);
        const note = `\n\n📌 *${result.message}*\n\n`;
        assistantBuffer += note;
        onChunk(note);
        results.push({
          type: "tool_result",
          tool_use_id: block.id,
          content: result.message,
          ...(result.ok ? {} : { is_error: true }),
        });
      } catch (e) {
        const msg = (e as Error).message;
        results.push({ type: "tool_result", tool_use_id: block.id, content: msg, is_error: true });
      }
    }
    convo.push({ role: "user", content: results });
  }

  return assistantBuffer;
}

// re-export so chat route can reference for symmetry
export { tools };

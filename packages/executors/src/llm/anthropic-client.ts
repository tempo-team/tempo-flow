// Copyright 2026 The tempo-flow Authors
// SPDX-License-Identifier: Apache-2.0

import Anthropic from "@anthropic-ai/sdk"
import { type LlmClient, type LlmRequest, type LlmResult, tryParseJson } from "./llm-client.js"

const DEFAULT_MODEL = "claude-opus-4-8"
const DEFAULT_MAX_TOKENS = 8192
const DEFAULT_MAX_TOOL_TURNS = 5

/**
 * Claude adapter. Uses adaptive thinking by default; when an outputSchema is
 * supplied it forces structured JSON via output_config.format. When tools are
 * supplied (with a runTool callback) it drives an agentic tool-use loop where
 * each tool call runs a sub-flow. API clients are cached per key.
 */
export class AnthropicClient implements LlmClient {
  readonly provider = "anthropic" as const
  readonly defaultModel = DEFAULT_MODEL

  private readonly clients = new Map<string, Anthropic>()

  constructor(
    private readonly factory: (apiKey: string) => Anthropic = (apiKey) => new Anthropic({ apiKey }),
  ) {}

  private client(apiKey: string): Anthropic {
    let c = this.clients.get(apiKey)
    if (!c) {
      c = this.factory(apiKey)
      this.clients.set(apiKey, c)
    }
    return c
  }

  async complete(req: LlmRequest): Promise<LlmResult> {
    const client = this.client(req.apiKey)
    req.onLog?.(`→ anthropic ${req.model} (${req.prompt.length} prompt chars)`)

    if (req.tools?.length && req.runTool) {
      return this.runToolLoop(client, req)
    }

    const body: Anthropic.MessageCreateParamsNonStreaming = {
      model: req.model,
      max_tokens: req.maxTokens ?? DEFAULT_MAX_TOKENS,
      thinking: { type: "adaptive" },
      messages: [{ role: "user", content: req.prompt }],
    }
    if (req.system) body.system = req.system
    if (req.effort) (body as { output_config?: unknown }).output_config = { effort: req.effort }
    if (req.outputSchema) {
      const oc = ((body as { output_config?: Record<string, unknown> }).output_config ??= {})
      oc.format = { type: "json_schema", schema: req.outputSchema }
    }

    const res = await client.messages.create(body)
    const text = textOf(res)
    req.onLog?.(`← ${res.usage.output_tokens} output tokens`)

    return {
      text,
      structured: req.outputSchema ? tryParseJson(text) : undefined,
      model: res.model,
      usage: { inputTokens: res.usage.input_tokens, outputTokens: res.usage.output_tokens },
    }
  }

  /**
   * Agentic loop: call the model with tools, run each requested tool (a sub-flow)
   * via runTool, feed the results back, and repeat until the model stops asking
   * for tools or the turn cap is hit. Token usage is summed across turns.
   */
  private async runToolLoop(client: Anthropic, req: LlmRequest): Promise<LlmResult> {
    const tools: Anthropic.Tool[] = (req.tools ?? []).map((t) => ({
      name: t.name,
      description: t.description,
      input_schema: t.inputSchema as Anthropic.Tool.InputSchema,
    }))
    const messages: Anthropic.MessageParam[] = [{ role: "user", content: req.prompt }]
    const maxTurns = req.maxToolTurns ?? DEFAULT_MAX_TOOL_TURNS
    let inputTokens = 0
    let outputTokens = 0
    let model = req.model

    for (let turn = 0; turn < maxTurns; turn++) {
      const body: Anthropic.MessageCreateParamsNonStreaming = {
        model: req.model,
        max_tokens: req.maxTokens ?? DEFAULT_MAX_TOKENS,
        thinking: { type: "adaptive" },
        messages,
        tools,
      }
      if (req.system) body.system = req.system
      if (req.effort) (body as { output_config?: unknown }).output_config = { effort: req.effort }

      const res = await client.messages.create(body)
      inputTokens += res.usage.input_tokens
      outputTokens += res.usage.output_tokens
      model = res.model

      const toolUses = res.content.filter((b): b is Anthropic.ToolUseBlock => b.type === "tool_use")
      if (res.stop_reason !== "tool_use" || toolUses.length === 0) {
        const text = textOf(res)
        return {
          text,
          structured: req.outputSchema ? tryParseJson(text) : undefined,
          model,
          usage: { inputTokens, outputTokens },
        }
      }

      messages.push({ role: "assistant", content: res.content })
      const results: Anthropic.ToolResultBlockParam[] = []
      for (const use of toolUses) {
        req.onLog?.(`⚙ tool ${use.name}`)
        let content: string
        let isError = false
        try {
          const out = await req.runTool!(use.name, use.input)
          content = JSON.stringify(out ?? null)
        } catch (err) {
          content = (err as Error).message
          isError = true
        }
        results.push({
          type: "tool_result",
          tool_use_id: use.id,
          content,
          is_error: isError,
        })
      }
      messages.push({ role: "user", content: results })
    }

    req.onLog?.(`← tool loop hit max turns (${maxTurns})`)
    return {
      text: "",
      structured: undefined,
      model,
      usage: { inputTokens, outputTokens },
    }
  }
}

/** Concatenate the text blocks of a Claude message. */
function textOf(res: Anthropic.Message): string {
  return res.content
    .filter((b): b is Anthropic.TextBlock => b.type === "text")
    .map((b) => b.text)
    .join("")
}

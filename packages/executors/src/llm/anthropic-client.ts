// Copyright 2026 The tempo-flow Authors
// SPDX-License-Identifier: Apache-2.0

import Anthropic from "@anthropic-ai/sdk"
import {
  type LlmClient,
  type LlmRequest,
  type LlmResult,
  type LlmStep,
  type LlmStepRequest,
  tryParseJson,
} from "./llm-client.js"

const DEFAULT_MODEL = "claude-opus-4-8"
const DEFAULT_MAX_TOKENS = 8192

/**
 * Claude adapter. Uses adaptive thinking by default; when an outputSchema is
 * supplied it forces structured JSON via output_config.format. `stepTools` runs
 * a single agentic turn — the durable agent driver (in the API) owns the loop and
 * persistence so it survives worker restarts. API clients are cached per key.
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
   * Run one agentic turn: call the model with the persisted conversation + tools.
   * If it requests tools, return them (the driver runs each as a sub-flow, appends
   * the results, and calls back here for the next turn). If it stops, return the
   * final text. No looping or persistence happens here — that's the driver's job.
   */
  async stepTools(req: LlmStepRequest): Promise<LlmStep> {
    const client = this.client(req.apiKey)
    const body: Anthropic.MessageCreateParamsNonStreaming = {
      model: req.model,
      max_tokens: req.maxTokens ?? DEFAULT_MAX_TOKENS,
      thinking: { type: "adaptive" },
      messages: req.messages as Anthropic.MessageParam[],
      tools: req.tools.map((t) => ({
        name: t.name,
        description: t.description,
        input_schema: t.inputSchema as Anthropic.Tool.InputSchema,
      })),
    }
    if (req.system) body.system = req.system
    if (req.effort) (body as { output_config?: unknown }).output_config = { effort: req.effort }

    const res = await client.messages.create(body)
    const toolUses = res.content
      .filter((b): b is Anthropic.ToolUseBlock => b.type === "tool_use")
      .map((b) => ({ id: b.id, name: b.name, input: b.input }))
    const done = res.stop_reason !== "tool_use" || toolUses.length === 0
    req.onLog?.(
      done ? `← turn done (${res.usage.output_tokens} out)` : `⚙ ${toolUses.length} tool(s)`,
    )

    return {
      assistantContent: res.content,
      toolUses,
      text: textOf(res),
      done,
      model: res.model,
      usage: { inputTokens: res.usage.input_tokens, outputTokens: res.usage.output_tokens },
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

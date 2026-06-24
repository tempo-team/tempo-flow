// Copyright 2026 The tempo-flow Authors
// SPDX-License-Identifier: Apache-2.0

import Anthropic from "@anthropic-ai/sdk"
import { type LlmClient, type LlmRequest, type LlmResult, tryParseJson } from "./llm-client.js"

const DEFAULT_MODEL = "claude-opus-4-8"
const DEFAULT_MAX_TOKENS = 8192

/**
 * Claude adapter. Uses adaptive thinking by default; when an outputSchema is
 * supplied it forces structured JSON via output_config.format. API clients are
 * cached per key (constructing one is cheap, but caching avoids churn).
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
    const text = res.content
      .filter((b): b is Anthropic.TextBlock => b.type === "text")
      .map((b) => b.text)
      .join("")
    req.onLog?.(`← ${res.usage.output_tokens} output tokens`)

    return {
      text,
      structured: req.outputSchema ? tryParseJson(text) : undefined,
      model: res.model,
      usage: { inputTokens: res.usage.input_tokens, outputTokens: res.usage.output_tokens },
    }
  }
}

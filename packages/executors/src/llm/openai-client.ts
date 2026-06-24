// Copyright 2026 The tempo-flow Authors
// SPDX-License-Identifier: Apache-2.0

import OpenAI from "openai"
import { type LlmClient, type LlmRequest, type LlmResult, tryParseJson } from "./llm-client.js"

const DEFAULT_MODEL = "gpt-5"
const DEFAULT_MAX_TOKENS = 4096

/**
 * OpenAI (incl. Codex models) adapter via the Chat Completions API. Structured
 * output uses a json_schema response format; `effort` maps to reasoning_effort.
 * Set the node's `model` to the exact OpenAI/Codex model id you use.
 */
export class OpenAiClient implements LlmClient {
  readonly provider = "openai" as const
  readonly defaultModel: string

  private readonly clients = new Map<string, OpenAI>()

  constructor(
    private readonly factory: (apiKey: string) => OpenAI = (apiKey) => new OpenAI({ apiKey }),
    defaultModel: string = DEFAULT_MODEL,
  ) {
    this.defaultModel = defaultModel
  }

  private client(apiKey: string): OpenAI {
    let c = this.clients.get(apiKey)
    if (!c) {
      c = this.factory(apiKey)
      this.clients.set(apiKey, c)
    }
    return c
  }

  async complete(req: LlmRequest): Promise<LlmResult> {
    const client = this.client(req.apiKey)
    req.onLog?.(`→ openai ${req.model} (${req.prompt.length} prompt chars)`)

    const messages: OpenAI.Chat.ChatCompletionMessageParam[] = []
    if (req.system) messages.push({ role: "system", content: req.system })
    messages.push({ role: "user", content: req.prompt })

    const body: Record<string, unknown> = {
      model: req.model,
      messages,
      max_completion_tokens: req.maxTokens ?? DEFAULT_MAX_TOKENS,
    }
    if (req.effort) body.reasoning_effort = req.effort
    if (req.outputSchema) {
      body.response_format = {
        type: "json_schema",
        json_schema: { name: "output", schema: req.outputSchema, strict: true },
      }
    }

    const res = (await client.chat.completions.create(
      body as unknown as OpenAI.Chat.ChatCompletionCreateParamsNonStreaming,
    )) as OpenAI.Chat.ChatCompletion
    const text = res.choices[0]?.message?.content ?? ""
    req.onLog?.(`← ${res.usage?.completion_tokens ?? 0} output tokens`)

    return {
      text,
      structured: req.outputSchema ? tryParseJson(text) : undefined,
      model: res.model,
      usage: {
        inputTokens: res.usage?.prompt_tokens ?? 0,
        outputTokens: res.usage?.completion_tokens ?? 0,
      },
    }
  }
}

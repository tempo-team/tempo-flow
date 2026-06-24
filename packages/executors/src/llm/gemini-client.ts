// Copyright 2026 The tempo-flow Authors
// SPDX-License-Identifier: Apache-2.0

import { GoogleGenAI } from "@google/genai"
import { type LlmClient, type LlmRequest, type LlmResult, tryParseJson } from "./llm-client.js"

const DEFAULT_MODEL = "gemini-2.5-pro"

/**
 * Google Gemini adapter. Structured output uses responseMimeType + responseSchema
 * (the outputSchema is passed through; provide a Gemini-compatible JSON schema).
 * Set the node's `model` to the exact Gemini model id you use.
 */
export class GeminiClient implements LlmClient {
  readonly provider = "gemini" as const
  readonly defaultModel: string

  private readonly clients = new Map<string, GoogleGenAI>()

  constructor(
    private readonly factory: (apiKey: string) => GoogleGenAI = (apiKey) =>
      new GoogleGenAI({ apiKey }),
    defaultModel: string = DEFAULT_MODEL,
  ) {
    this.defaultModel = defaultModel
  }

  private client(apiKey: string): GoogleGenAI {
    let c = this.clients.get(apiKey)
    if (!c) {
      c = this.factory(apiKey)
      this.clients.set(apiKey, c)
    }
    return c
  }

  async complete(req: LlmRequest): Promise<LlmResult> {
    const client = this.client(req.apiKey)
    req.onLog?.(`→ gemini ${req.model} (${req.prompt.length} prompt chars)`)

    const config: Record<string, unknown> = {}
    if (req.system) config.systemInstruction = req.system
    if (req.maxTokens) config.maxOutputTokens = req.maxTokens
    if (req.outputSchema) {
      config.responseMimeType = "application/json"
      config.responseSchema = req.outputSchema
    }

    const res = await client.models.generateContent({
      model: req.model,
      contents: req.prompt,
      config,
    })
    const text = res.text ?? ""
    const usage = res.usageMetadata
    req.onLog?.(`← ${usage?.candidatesTokenCount ?? 0} output tokens`)

    return {
      text,
      structured: req.outputSchema ? tryParseJson(text) : undefined,
      model: req.model,
      usage: {
        inputTokens: usage?.promptTokenCount ?? 0,
        outputTokens: usage?.candidatesTokenCount ?? 0,
      },
    }
  }
}

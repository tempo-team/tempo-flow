// Copyright 2026 The tempo-flow Authors
// SPDX-License-Identifier: Apache-2.0

import type { LlmProvider } from "@tempo-flow/shared-types"

/** A single model completion request, provider-agnostic. */
export interface LlmRequest {
  apiKey: string
  model: string
  system?: string
  prompt: string
  maxTokens?: number
  effort?: "low" | "medium" | "high"
  /** JSON Schema — when set, the provider is forced to return matching JSON. */
  outputSchema?: Record<string, unknown>
  /** Stream progress lines (best-effort). */
  onLog?: (line: string) => void
}

/** Normalized completion result across providers. */
export interface LlmResult {
  text: string
  /** Parsed JSON when an outputSchema was supplied. */
  structured?: unknown
  model: string
  usage: { inputTokens: number; outputTokens: number }
}

/**
 * Pluggable model backend. One adapter per provider (Anthropic, OpenAI, Gemini),
 * all sharing this contract so the LLM executor can route by config alone.
 */
export interface LlmClient {
  readonly provider: LlmProvider
  /** Default model when the node doesn't specify one. */
  readonly defaultModel: string
  complete(req: LlmRequest): Promise<LlmResult>
}

// Copyright 2026 The tempo-flow Authors
// SPDX-License-Identifier: Apache-2.0

import type { LlmProvider } from "@tempo-flow/shared-types"

/** A tool the model may call during an agentic turn. */
export interface LlmTool {
  name: string
  description: string
  inputSchema: Record<string, unknown>
}

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
 * One turn of an agentic tool loop. The conversation `messages` are provider-
 * native and shuttled verbatim by the durable agent driver (persisted between
 * turns), so the loop survives worker restarts. Anthropic-only for now.
 */
export interface LlmStepRequest {
  apiKey: string
  model: string
  system?: string
  /** Provider-native message history (e.g. Anthropic MessageParam[]). */
  messages: unknown[]
  tools: LlmTool[]
  maxTokens?: number
  effort?: "low" | "medium" | "high"
  onLog?: (line: string) => void
}

/** Result of a single agentic turn. */
export interface LlmStep {
  /** The assistant message content to append to the conversation verbatim. */
  assistantContent: unknown
  /** Tools the model asked to run this turn (empty when it finished). */
  toolUses: { id: string; name: string; input: unknown }[]
  /** Final assistant text (meaningful when `done`). */
  text: string
  /** True when the model stopped without requesting tools. */
  done: boolean
  model: string
  usage: { inputTokens: number; outputTokens: number }
}

/**
 * Pluggable model backend. One adapter per provider (Anthropic, OpenAI, Gemini),
 * all sharing this contract so the LLM executor can route by config alone.
 * `stepTools` (one agentic turn) is optional — only providers that support the
 * durable tool loop implement it.
 */
export interface LlmClient {
  readonly provider: LlmProvider
  /** Default model when the node doesn't specify one. */
  readonly defaultModel: string
  complete(req: LlmRequest): Promise<LlmResult>
  /** One agentic turn over a persisted conversation (durable tool loop). */
  stepTools?(req: LlmStepRequest): Promise<LlmStep>
}

/** Parse a model's text output as JSON, returning undefined on failure. */
export function tryParseJson(text: string): unknown {
  try {
    return JSON.parse(text)
  } catch {
    return undefined
  }
}

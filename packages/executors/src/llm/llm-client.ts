// Copyright 2026 The tempo-flow Authors
// SPDX-License-Identifier: Apache-2.0

import type { LlmProvider } from "@tempo-flow/shared-types"

/** A tool the model may call during an agentic turn. */
export interface LlmTool {
  name: string
  description: string
  inputSchema: Record<string, unknown>
}

/**
 * Executes a tool the model asked for and returns the result fed back to it.
 * In tempo-flow this runs the tool's sub-flow and returns its node outputs.
 */
export type ToolRunner = (name: string, input: unknown) => Promise<unknown>

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
  /** Tools the model may call. When set with `runTool`, the adapter runs an agentic loop. */
  tools?: LlmTool[]
  /** Invoked when the model calls a tool; its result is returned to the model. */
  runTool?: ToolRunner
  /** Max tool-calling turns before stopping (default 5). */
  maxToolTurns?: number
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
  /**
   * True when an agentic tool loop stopped without the model finishing (hit the
   * turn cap). The executor treats this as a node failure rather than a silent
   * empty success.
   */
  incomplete?: boolean
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

/** Parse a model's text output as JSON, returning undefined on failure. */
export function tryParseJson(text: string): unknown {
  try {
    return JSON.parse(text)
  } catch {
    return undefined
  }
}

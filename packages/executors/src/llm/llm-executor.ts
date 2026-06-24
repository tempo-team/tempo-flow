// Copyright 2026 The tempo-flow Authors
// SPDX-License-Identifier: Apache-2.0

import type { FlowNode, LlmExecutorConfig, LlmProvider } from "@tempo-flow/shared-types"
import type { ExecResult, JobExecutor, RunContext } from "../executor.js"
import { interpolateExpr } from "../params.js"
import type { LlmClient } from "./llm-client.js"

/** Standard secret name holding each provider's API key. */
const DEFAULT_KEY_SECRET: Record<LlmProvider, string> = {
  anthropic: "ANTHROPIC_API_KEY",
  openai: "OPENAI_API_KEY",
  gemini: "GEMINI_API_KEY",
}

/**
 * Calls an LLM (Claude / OpenAI / Gemini) as a node. `system` and `prompt` are
 * resolved as `={{ }}` expressions (so they can reference upstream outputs, the
 * fan-out item, params, and secrets). With an `outputSchema` the model returns
 * structured JSON, which becomes NodeRun.output for downstream chaining. The API
 * key is pulled from the secret store and never recorded.
 */
export class LlmExecutor implements JobExecutor {
  readonly type = "llm" as const

  constructor(private readonly clients: Partial<Record<LlmProvider, LlmClient>>) {}

  async execute(node: FlowNode, ctx: RunContext): Promise<ExecResult> {
    const cfg = node.executor as LlmExecutorConfig
    const provider: LlmProvider = cfg.provider ?? "anthropic"
    const client = this.clients[provider]
    if (!client) {
      return { ok: false, errorMessage: `No LLM client registered for provider "${provider}"` }
    }

    const exprCtx = {
      runDate: ctx.runDate,
      params: ctx.params,
      nodes: ctx.nodeOutputs,
      secrets: ctx.secrets,
      item: ctx.item,
    }
    const prompt = await interpolateExpr(cfg.prompt, exprCtx)
    const system = cfg.system ? await interpolateExpr(cfg.system, exprCtx) : undefined

    const keySecret = cfg.apiKeySecret ?? DEFAULT_KEY_SECRET[provider]
    const apiKey = ctx.secrets?.[keySecret]
    if (!apiKey) {
      return {
        ok: false,
        request: requestOf(cfg, client.defaultModel),
        errorMessage: `Missing API key — set secret "${keySecret}"`,
      }
    }

    const model = cfg.model ?? client.defaultModel
    const request = requestOf(cfg, model)
    try {
      const result = await client.complete({
        apiKey,
        model,
        system,
        prompt,
        maxTokens: cfg.maxTokens,
        effort: cfg.effort,
        outputSchema: cfg.outputSchema,
        onLog: ctx.onLog,
      })
      return {
        ok: true,
        request,
        response: { model: result.model, usage: result.usage },
        output: cfg.outputSchema ? result.structured : { text: result.text },
      }
    } catch (err) {
      return { ok: false, request, errorMessage: (err as Error).message }
    }
  }
}

/** Recorded request — never includes the prompt body or the API key. */
function requestOf(cfg: LlmExecutorConfig, model: string) {
  return {
    provider: cfg.provider ?? "anthropic",
    model,
    structured: Boolean(cfg.outputSchema),
    promptChars: cfg.prompt.length,
  }
}

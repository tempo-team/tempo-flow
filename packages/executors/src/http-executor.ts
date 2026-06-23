// Copyright 2026 The tempo-flow Authors
// SPDX-License-Identifier: Apache-2.0

import type { FlowNode, HttpExecutorConfig } from "@tempo-flow/shared-types"
import type { ExecResult, JobExecutor, RunContext } from "./executor.js"
import { resolveNodeParams, resolveValueExpr } from "./params.js"

const DEFAULT_TIMEOUT_MS = 30_000

/**
 * Executes a node by calling an HTTP endpoint. Resolved params (static +
 * reservation dates) are sent as a query string (default) or JSON body. The
 * issued request and the response are returned for NodeRun bookkeeping.
 */
export class HttpExecutor implements JobExecutor {
  readonly type = "http" as const

  // Injectable for tests; defaults to global fetch (Node 20+).
  constructor(private readonly fetchImpl: typeof fetch = fetch) {}

  async execute(node: FlowNode, ctx: RunContext): Promise<ExecResult> {
    const cfg = node.executor as HttpExecutorConfig
    const params = await resolveNodeParams(node, {
      runDate: ctx.runDate,
      overrides: ctx.params,
      item: ctx.item,
      nodes: ctx.nodeOutputs,
      secrets: ctx.secrets,
    })
    const paramsIn = cfg.paramsIn ?? "query"

    const url = new URL(cfg.url)
    let body: string | undefined
    // Resolve `={{ secrets.X }}` / `={{ params.Y }}` expressions in header values.
    const exprCtx = {
      runDate: ctx.runDate,
      params,
      nodes: ctx.nodeOutputs,
      secrets: ctx.secrets,
      item: ctx.item,
    }
    const headers: Record<string, string> = {}
    for (const [k, v] of Object.entries(cfg.headers ?? {})) {
      headers[k] = await resolveValueExpr(v, exprCtx)
    }

    // Callback mode: tell the external job where to report its real completion.
    // Sent both as headers and merged params so simple receivers can read either.
    if (ctx.callback) {
      headers["x-tempo-callback-url"] = ctx.callback.url
      headers["x-tempo-callback-token"] = ctx.callback.token
      headers["x-tempo-run-id"] = ctx.flowRunId
      headers["x-tempo-node-id"] = ctx.nodeId
      params._tempoCallbackUrl = ctx.callback.url
      params._tempoCallbackToken = ctx.callback.token
    }

    if (paramsIn === "query") {
      for (const [k, v] of Object.entries(params)) url.searchParams.set(k, v)
    } else {
      body = JSON.stringify(params)
      headers["content-type"] = headers["content-type"] ?? "application/json"
    }

    const request = { url: url.toString(), method: cfg.method, headers, body, params }
    const controller = new AbortController()
    const timeoutMs = node.timeoutMs ?? DEFAULT_TIMEOUT_MS
    const timer = setTimeout(() => controller.abort(), timeoutMs)

    ctx.onLog?.(`→ ${cfg.method} ${url.toString()}`)
    try {
      const res = await this.fetchImpl(url.toString(), {
        method: cfg.method,
        headers,
        body,
        signal: controller.signal,
      })
      const text = await res.text()
      const response = { status: res.status, body: text }
      ctx.onLog?.(`← ${res.status} (${text.length} bytes)`)
      if (!res.ok) {
        return { ok: false, request, response, errorMessage: `HTTP ${res.status}` }
      }
      return { ok: true, request, response }
    } catch (err) {
      const aborted = err instanceof Error && err.name === "AbortError"
      const message = aborted ? `timeout after ${timeoutMs}ms` : (err as Error).message
      ctx.onLog?.(`✗ ${message}`)
      return { ok: false, request, errorMessage: message }
    } finally {
      clearTimeout(timer)
    }
  }
}

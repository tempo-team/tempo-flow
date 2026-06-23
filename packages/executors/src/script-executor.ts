// Copyright 2026 The tempo-flow Authors
// SPDX-License-Identifier: Apache-2.0

import type { FlowNode, ScriptExecutorConfig, ScriptLanguage } from "@tempo-flow/shared-types"
import type { ExecResult, JobExecutor, RunContext } from "./executor.js"
import { resolveNodeParams } from "./params.js"

const DEFAULT_TIMEOUT_MS = 5 * 60 * 1000
const OUTPUT_TAIL = 4000

/** What a runner is asked to execute. The runner owns isolation + capture. */
export interface ScriptRunSpec {
  language: ScriptLanguage
  code: string
  image?: string
  env: Record<string, string>
  network: boolean
  timeoutMs: number
  onLog?: (line: string) => void
}

export interface ScriptRunResult {
  exitCode: number
  stdout: string
  stderr: string
  timedOut?: boolean
}

/** Pluggable backend that runs a script in isolation (Docker, K8s, ...). */
export interface ScriptRunner {
  run(spec: ScriptRunSpec): Promise<ScriptRunResult>
}

/**
 * Runs an inline script (Python/Node/Bash/Go) in an isolated, per-execution
 * container. Resolved params are injected as `TF_PARAM_<KEY>` env vars plus a
 * `TEMPO_PARAMS` JSON blob. The script's structured result is the last line of
 * stdout that parses as JSON — recorded into NodeRun.output for downstream use.
 * In `callback` completion mode the callback env is injected too, so a script
 * can fire-and-defer to an external system.
 */
export class ScriptExecutor implements JobExecutor {
  readonly type = "script" as const

  constructor(private readonly runner: ScriptRunner) {}

  async execute(node: FlowNode, ctx: RunContext): Promise<ExecResult> {
    const cfg = node.executor as ScriptExecutorConfig
    const params = await resolveNodeParams(node, {
      runDate: ctx.runDate,
      overrides: ctx.params,
      item: ctx.item,
      nodes: ctx.nodeOutputs,
    })

    const env: Record<string, string> = {
      TEMPO_PARAMS: JSON.stringify(params),
      TEMPO_RUN_ID: ctx.flowRunId,
      TEMPO_NODE_ID: ctx.nodeId,
    }
    for (const [key, value] of Object.entries(params)) env[envKey(key)] = value
    if (ctx.item !== undefined) {
      env.TEMPO_ITEM = typeof ctx.item === "string" ? ctx.item : JSON.stringify(ctx.item)
      env.TEMPO_MAP_INDEX = String(ctx.mapIndex ?? 0)
    }
    if (ctx.callback) {
      env.TEMPO_CALLBACK_URL = ctx.callback.url
      env.TEMPO_CALLBACK_TOKEN = ctx.callback.token
    }

    const spec: ScriptRunSpec = {
      language: cfg.language,
      code: cfg.code,
      image: cfg.image,
      env,
      network: cfg.network ?? false,
      timeoutMs: node.timeoutMs ?? DEFAULT_TIMEOUT_MS,
      onLog: ctx.onLog,
    }

    let result: ScriptRunResult
    try {
      result = await this.runner.run(spec)
    } catch (err) {
      return { ok: false, request: requestOf(cfg), errorMessage: (err as Error).message }
    }

    const request = requestOf(cfg)
    const response = {
      exitCode: result.exitCode,
      stdout: tail(result.stdout),
      stderr: tail(result.stderr),
      timedOut: result.timedOut,
    }
    if (result.timedOut) {
      return {
        ok: false,
        request,
        response,
        errorMessage: `script timed out after ${spec.timeoutMs}ms`,
      }
    }
    if (result.exitCode !== 0) {
      const reason = lastLine(result.stderr) || `exit code ${result.exitCode}`
      return { ok: false, request, response, errorMessage: reason }
    }
    return { ok: true, request, response, output: parseOutput(result.stdout) }
  }
}

/** Default base image per language (overridable via cfg.image). */
export const DEFAULT_SCRIPT_IMAGES: Record<ScriptLanguage, string> = {
  python: "python:3.13-slim",
  node: "node:24-alpine",
  bash: "busybox:1.36",
  go: "golang:1.23-alpine",
}

function requestOf(cfg: ScriptExecutorConfig) {
  return { language: cfg.language, image: cfg.image ?? DEFAULT_SCRIPT_IMAGES[cfg.language] }
}

/** Sanitize a param key into a valid env var name. */
function envKey(key: string): string {
  return `TF_PARAM_${key.replace(/[^A-Za-z0-9_]/g, "_").toUpperCase()}`
}

/** The last stdout line that parses as JSON is the node's structured output. */
function parseOutput(stdout: string): unknown {
  const lines = stdout
    .split("\n")
    .map((l) => l.trim())
    .filter(Boolean)
  for (let i = lines.length - 1; i >= 0; i--) {
    const line = lines[i]
    if (!(line.startsWith("{") || line.startsWith("["))) continue
    try {
      return JSON.parse(line)
    } catch {
      // not JSON; keep scanning upward
    }
  }
  return undefined
}

function lastLine(text: string): string {
  const lines = text
    .split("\n")
    .map((l) => l.trim())
    .filter(Boolean)
  return lines[lines.length - 1] ?? ""
}

function tail(text: string): string {
  return text.length > OUTPUT_TAIL ? text.slice(-OUTPUT_TAIL) : text
}

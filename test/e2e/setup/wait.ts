// Copyright 2026 The tempo-flow Authors
// SPDX-License-Identifier: Apache-2.0
//
// Polling helpers — timing-dependent assertions must poll, never fixed-sleep.

import { type ApiClient, admin } from "./client"

const TERMINAL = ["SUCCESS", "FAILED", "CANCELED"]

export interface NodeRunView {
  id: string
  nodeId: string
  status: string
  attempt: number
  executor: string
  request: unknown
  response: unknown
  output: unknown
  errorMessage: string | null
  startedAt: string | null
  finishedAt: string | null
}

export interface RunView {
  id: string
  flowId: string
  status: string
  trigger: string
  startedAt: string | null
  finishedAt: string | null
  createdAt: string
  nodeRuns?: NodeRunView[]
}

/** Poll until `predicate` is true or timeout; returns the last value seen. */
export async function waitFor<T>(
  fn: () => Promise<T>,
  predicate: (v: T) => boolean,
  opts: { timeout?: number; interval?: number; label?: string } = {},
): Promise<T> {
  const timeout = opts.timeout ?? 20_000
  const interval = opts.interval ?? 200
  const deadline = Date.now() + timeout
  let last: T = await fn()
  while (!predicate(last)) {
    if (Date.now() > deadline) {
      throw new Error(
        `waitFor timed out${opts.label ? ` (${opts.label})` : ""}: last=${JSON.stringify(last)}`,
      )
    }
    await new Promise((r) => setTimeout(r, interval))
    last = await fn()
  }
  return last
}

export async function getRun(runId: string, client?: ApiClient): Promise<RunView> {
  const c = client ?? (await admin())
  const res = await c.get<RunView>(`/api/runs/${runId}`)
  if (res.status !== 200) throw new Error(`getRun ${runId} → ${res.status}`)
  return res.body
}

/** Wait until a run reaches a specific status. */
export async function waitForRun(
  runId: string,
  status: string,
  opts: { timeout?: number; client?: ApiClient } = {},
): Promise<RunView> {
  return waitFor(
    () => getRun(runId, opts.client),
    (r) => r.status === status,
    {
      timeout: opts.timeout,
      label: `run ${runId} → ${status}`,
    },
  )
}

/** Wait until a run reaches any terminal status. */
export async function waitForTerminal(
  runId: string,
  opts: { timeout?: number; client?: ApiClient } = {},
): Promise<RunView> {
  return waitFor(
    () => getRun(runId, opts.client),
    (r) => TERMINAL.includes(r.status),
    {
      timeout: opts.timeout,
      label: `run ${runId} → terminal`,
    },
  )
}

export function nodeRun(run: RunView, nodeId: string): NodeRunView | undefined {
  return run.nodeRuns?.find((n) => n.nodeId === nodeId)
}

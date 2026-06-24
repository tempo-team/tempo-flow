// Copyright 2026 The tempo-flow Authors
// SPDX-License-Identifier: Apache-2.0

import type { SubflowRunner } from "@tempo-flow/executors"
import { RunStatus, fromJsonOpt, isTerminal } from "@tempo-flow/shared-types"
import type { PrismaService } from "../prisma/prisma.service"
import { findFlowCycle } from "./subflow-cycle"
import type { RunLauncherService } from "./run-launcher.service"

const POLL_INTERVAL_MS = 1000
const DEFAULT_TIMEOUT_MS = 30 * 60 * 1000 // 30 min ceiling per tool call

const sleep = (ms: number): Promise<void> => new Promise((resolve) => setTimeout(resolve, ms))

/**
 * Builds the SubflowRunner the LLM executor uses for agentic tool calls. When
 * the model calls a tool, this launches that tool's flow (as a child run), waits
 * for it to finish, and returns the child's node outputs as the tool result fed
 * back to the model. Reuses the same cycle guard as the subflow executor so a
 * tool flow cannot (transitively) invoke its own ancestor and spin forever.
 */
export function makeSubflowToolRunner(
  launcher: RunLauncherService,
  prisma: PrismaService,
): SubflowRunner {
  return async ({ flowId, input, ctx }) => {
    // Throw on hard failures (cycle, timeout): the LLM adapter catches and marks
    // the tool_result is_error so the model gets a clear failure signal. Terminal
    // child runs (incl. FAILED) return data so the model can read status/outputs.
    const cycle = await findFlowCycle(prisma, ctx.flowRunId, flowId)
    if (cycle) {
      throw new Error(`Tool sub-flow cycle detected: ${cycle}`)
    }

    const child = await launcher.launch({
      flowId,
      trigger: "subflow",
      params: toParams(input),
      parentRunId: ctx.flowRunId,
    })
    ctx.onLog?.(`→ tool launched sub-flow run ${child.id} (flow ${flowId})`)

    const deadline = Date.now() + DEFAULT_TIMEOUT_MS
    while (Date.now() < deadline) {
      await sleep(POLL_INTERVAL_MS)
      const run = await prisma.flowRun.findUnique({
        where: { id: child.id },
        select: { status: true },
      })
      if (!run) continue
      if (isTerminal(run.status as RunStatus)) {
        ctx.onLog?.(`← tool sub-flow run ${child.id} finished: ${run.status}`)
        const outputs = await loadOutputs(prisma, child.id)
        return { status: run.status, outputs }
      }
    }

    ctx.onLog?.(`✗ tool sub-flow run ${child.id} timed out`)
    throw new Error(`Tool sub-flow ${flowId} timed out`)
  }
}

/**
 * Map the model's tool input (arbitrary JSON object) to flow params. Top-level
 * string values pass through; non-strings are JSON-encoded so sub-flow nodes can
 * read `={{ params.x }}`. A non-object input is stored whole under `input`.
 */
function toParams(input: unknown): Record<string, string> {
  if (!input || typeof input !== "object" || Array.isArray(input)) {
    return { input: JSON.stringify(input ?? null) }
  }
  const out: Record<string, string> = {}
  for (const [k, v] of Object.entries(input)) {
    out[k] = typeof v === "string" ? v : JSON.stringify(v)
  }
  return out
}

/** Read the child run's node outputs to return to the model as the tool result. */
async function loadOutputs(
  prisma: PrismaService,
  flowRunId: string,
): Promise<{ nodeId: string; output: unknown }[]> {
  const rows = await prisma.nodeRun.findMany({
    where: { flowRunId, output: { not: null } },
    select: { nodeId: true, output: true },
  })
  return rows.map((r) => ({ nodeId: r.nodeId, output: fromJsonOpt(r.output) ?? null }))
}

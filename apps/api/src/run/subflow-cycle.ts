// Copyright 2026 The tempo-flow Authors
// SPDX-License-Identifier: Apache-2.0

import type { PrismaService } from "../prisma/prisma.service"

/**
 * Walk the parentRunId chain upward from `flowRunId`. If `childFlowId` already
 * appears in the ancestry (including the current run's own flow), launching it
 * would recurse — return a readable "a → b → child" path. Returns null when no
 * cycle. Bounded to avoid pathological chains. Shared by the subflow executor
 * and the LLM tool runner (both launch child flows from within a run).
 */
export async function findFlowCycle(
  prisma: PrismaService,
  flowRunId: string,
  childFlowId: string,
): Promise<string | null> {
  const chain: string[] = []
  let cursor: string | null = flowRunId
  for (let depth = 0; cursor && depth < 50; depth++) {
    const run: { flowId: string; parentRunId: string | null } | null =
      await prisma.flowRun.findUnique({
        where: { id: cursor },
        select: { flowId: true, parentRunId: true },
      })
    if (!run) break
    chain.push(run.flowId)
    if (run.flowId === childFlowId) {
      return [...chain].reverse().concat(childFlowId).join(" → ")
    }
    cursor = run.parentRunId
  }
  return null
}

/** Run-level guardrails enforced before launching a sub-flow / agent-tool child. */
export interface LaunchGuardrails {
  maxSubflowDepth?: number
  allowedToolFlows?: string[]
}

/**
 * Enforce launch-time guardrails before starting a child flow run. Returns an
 * error message to fail the launch, or null when allowed. Shared by the sub-flow
 * executor and the agent-tool driver so both paths are governed identically.
 */
export async function checkLaunchGuardrails(
  prisma: PrismaService,
  flowRunId: string,
  childFlowId: string,
  guardrails: LaunchGuardrails | undefined,
): Promise<string | null> {
  if (!guardrails) return null
  if (guardrails.allowedToolFlows && !guardrails.allowedToolFlows.includes(childFlowId)) {
    return `guardrail: flow "${childFlowId}" is not in allowedToolFlows`
  }
  if (guardrails.maxSubflowDepth !== undefined) {
    const depth = await flowChainDepth(prisma, flowRunId)
    if (depth >= guardrails.maxSubflowDepth) {
      return `guardrail: max sub-flow depth ${guardrails.maxSubflowDepth} reached`
    }
  }
  return null
}

/**
 * Count how many sub-flow levels deep `flowRunId` already is (root run = 0). Used
 * by the maxSubflowDepth guardrail: a launch is allowed only while depth < max.
 * Bounded so a pathological chain can't hang the walk.
 */
export async function flowChainDepth(prisma: PrismaService, flowRunId: string): Promise<number> {
  let depth = 0
  let cursor: string | null = flowRunId
  for (let i = 0; cursor && i < 100; i++) {
    const run: { parentRunId: string | null } | null = await prisma.flowRun.findUnique({
      where: { id: cursor },
      select: { parentRunId: true },
    })
    if (!run?.parentRunId) break
    depth++
    cursor = run.parentRunId
  }
  return depth
}

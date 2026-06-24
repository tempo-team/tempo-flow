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

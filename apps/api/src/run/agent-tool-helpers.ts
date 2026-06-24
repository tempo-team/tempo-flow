// Copyright 2026 The tempo-flow Authors
// SPDX-License-Identifier: Apache-2.0

import { fromJsonOpt } from "@tempo-flow/shared-types"
import type { PrismaService } from "../prisma/prisma.service"

/**
 * Map the model's tool input (arbitrary JSON object) to flow params. Top-level
 * string values pass through; non-strings are JSON-encoded so the tool sub-flow's
 * nodes can read `={{ params.x }}`. A non-object input is stored whole under
 * `input`. Keyed off prototype-safe own entries only.
 */
export function toParams(input: unknown): Record<string, string> {
  if (!input || typeof input !== "object" || Array.isArray(input)) {
    return { input: JSON.stringify(input ?? null) }
  }
  const out: Record<string, string> = {}
  for (const [k, v] of Object.entries(input)) {
    out[k] = typeof v === "string" ? v : JSON.stringify(v)
  }
  return out
}

/** Read a (child) run's node outputs to feed back to the model as a tool result. */
export async function loadChildOutputs(
  prisma: PrismaService,
  flowRunId: string,
): Promise<{ nodeId: string; output: unknown }[]> {
  const rows = await prisma.nodeRun.findMany({
    where: { flowRunId, output: { not: null } },
    select: { nodeId: true, output: true },
  })
  return rows.map((r) => ({ nodeId: r.nodeId, output: fromJsonOpt(r.output) ?? null }))
}

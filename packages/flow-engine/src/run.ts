// Copyright 2026 The tempo-flow Authors
// SPDX-License-Identifier: Apache-2.0

import type { FlowDefinition, FlowNode } from "@tempo-flow/shared-types"

export type NodeOutcome = "success" | "failure"

export function getNode(def: FlowDefinition, nodeId: string): FlowNode | undefined {
  return def.nodes.find((n) => n.id === nodeId)
}

/**
 * Targets to run next after `nodeId` completes with `outcome`. An edge fires
 * when its `on` matches the outcome or is `always` — this is how multiple
 * successors (fan-out) and success/failure branching are expressed.
 */
export function outgoingTargets(
  def: FlowDefinition,
  nodeId: string,
  outcome: NodeOutcome,
): string[] {
  return def.edges
    .filter((e) => e.source === nodeId && (e.on === outcome || e.on === "always"))
    .map((e) => e.target)
}

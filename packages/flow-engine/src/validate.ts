// Copyright 2026 The tempo-flow Authors
// SPDX-License-Identifier: Apache-2.0

import type { FlowDefinition, FlowTrigger } from "@tempo-flow/shared-types"
import { flowDefinitionSchema, flowTriggerSchema } from "./schema.js"

export interface ValidationResult {
  ok: boolean
  errors: string[]
}

export class FlowValidationError extends Error {
  constructor(public readonly errors: string[]) {
    super(`Invalid flow definition: ${errors.join("; ")}`)
    this.name = "FlowValidationError"
  }
}

/**
 * Validate a flow definition: shape (Zod) + DAG semantics (unique node ids,
 * edges reference real nodes, no cycles, at least one entry node).
 */
export function validateFlowDefinition(input: unknown): ValidationResult {
  const parsed = flowDefinitionSchema.safeParse(input)
  if (!parsed.success) {
    return {
      ok: false,
      errors: parsed.error.issues.map((i) => `${i.path.join(".")}: ${i.message}`),
    }
  }

  const def = parsed.data as FlowDefinition
  const errors: string[] = []

  // Unique node ids
  const ids = new Set<string>()
  for (const node of def.nodes) {
    if (ids.has(node.id)) errors.push(`duplicate node id "${node.id}"`)
    ids.add(node.id)
  }

  if (def.nodes.length === 0) errors.push("flow must have at least one node")

  // Edge endpoints valid + unique edge ids
  const edgeIds = new Set<string>()
  for (const edge of def.edges) {
    if (edgeIds.has(edge.id)) errors.push(`duplicate edge id "${edge.id}"`)
    edgeIds.add(edge.id)
    if (!ids.has(edge.source)) errors.push(`edge "${edge.id}" has unknown source "${edge.source}"`)
    if (!ids.has(edge.target)) errors.push(`edge "${edge.id}" has unknown target "${edge.target}"`)
    if (edge.source === edge.target) errors.push(`edge "${edge.id}" is a self-loop`)
  }

  // Cycle detection (only over valid edges)
  if (errors.length === 0 && hasCycle(def)) {
    errors.push("flow definition contains a cycle (must be a DAG)")
  }

  // Entry node: at least one node with no incoming edge
  if (def.nodes.length > 0 && def.edges.length > 0) {
    const targets = new Set(def.edges.map((e) => e.target))
    const entries = def.nodes.filter((n) => !targets.has(n.id))
    if (entries.length === 0)
      errors.push("flow has no entry node (every node has an incoming edge)")
  }

  return { ok: errors.length === 0, errors }
}

/** Throws FlowValidationError when invalid. */
export function assertValidFlowDefinition(input: unknown): FlowDefinition {
  const result = validateFlowDefinition(input)
  if (!result.ok) throw new FlowValidationError(result.errors)
  return input as FlowDefinition
}

export function validateFlowTrigger(input: unknown): ValidationResult {
  const parsed = flowTriggerSchema.safeParse(input)
  if (!parsed.success) {
    return {
      ok: false,
      errors: parsed.error.issues.map((i) => `${i.path.join(".")}: ${i.message}`),
    }
  }
  const trigger = parsed.data as FlowTrigger
  if (trigger.type === "cron" && !trigger.expr) {
    return { ok: false, errors: ["cron trigger requires an expr"] }
  }
  return { ok: true, errors: [] }
}

/** Return entry node ids (nodes with no incoming edge). */
export function entryNodes(def: FlowDefinition): string[] {
  const targets = new Set(def.edges.map((e) => e.target))
  return def.nodes.filter((n) => !targets.has(n.id)).map((n) => n.id)
}

function hasCycle(def: FlowDefinition): boolean {
  const adjacency = new Map<string, string[]>()
  for (const node of def.nodes) adjacency.set(node.id, [])
  for (const edge of def.edges) adjacency.get(edge.source)?.push(edge.target)

  const WHITE = 0
  const GRAY = 1
  const BLACK = 2
  const color = new Map<string, number>()
  for (const node of def.nodes) color.set(node.id, WHITE)

  const visit = (id: string): boolean => {
    color.set(id, GRAY)
    for (const next of adjacency.get(id) ?? []) {
      const c = color.get(next)
      if (c === GRAY) return true
      if (c === WHITE && visit(next)) return true
    }
    color.set(id, BLACK)
    return false
  }

  for (const node of def.nodes) {
    if (color.get(node.id) === WHITE && visit(node.id)) return true
  }
  return false
}

// Copyright 2026 The tempo-flow Authors
// SPDX-License-Identifier: Apache-2.0
//
// Lightweight flow-definition builders. Loosely typed on purpose so the e2e
// package needs no workspace type imports — the API validates the real shape.

import { type ApiClient, admin } from "./client"
import { fixtureUrl } from "./fixture-client"

export type Json = Record<string, unknown>

export interface NodeOpts {
  params?: Json
  retry?: { max: number; backoff: "fixed" | "exponential"; delayMs: number }
  timeoutMs?: number
  completion?: "sync" | "callback"
  callbackTimeoutMs?: number
  forEach?: string
  forEachConcurrency?: number
  join?: "all" | "any" | "ratio"
  joinRatio?: number
}

export interface FlowNodeDef extends NodeOpts {
  id: string
  name: string
  executor: Json
}

export interface FlowEdgeDef {
  id: string
  source: string
  target: string
  on: "success" | "failure" | "always"
}

/** A node whose HTTP executor points at a fixture path (e.g. "/echo"). */
export function httpNode(
  id: string,
  path: string,
  opts: NodeOpts & {
    method?: string
    paramsIn?: "query" | "body"
    headers?: Record<string, string>
  } = {},
): FlowNodeDef {
  const { method = "POST", paramsIn = "body", headers, ...rest } = opts
  return {
    id,
    name: id,
    executor: {
      type: "http",
      url: fixtureUrl(path),
      method,
      paramsIn,
      ...(headers ? { headers } : {}),
    },
    ...rest,
  }
}

/** A sub-flow node that launches and waits on another flow. */
export function subflowNode(id: string, flowId: string, opts: NodeOpts = {}): FlowNodeDef {
  return { id, name: id, executor: { type: "subflow", flowId }, ...opts }
}

export function node(id: string, executor: Json, opts: NodeOpts = {}): FlowNodeDef {
  return { id, name: id, executor, ...opts }
}

export function edge(
  source: string,
  target: string,
  on: "success" | "failure" | "always" = "success",
): FlowEdgeDef {
  return { id: `${source}->${target}:${on}`, source, target, on }
}

export interface FlowSpec {
  name?: string
  nodes: FlowNodeDef[]
  edges?: FlowEdgeDef[]
  guardrails?: Json
  trigger?: Json
  enabled?: boolean
  overlapPolicy?: "skip" | "allow"
  slaMs?: number
  requiresApproval?: boolean
}

let flowSeq = 0

/** Build a CreateFlowRequest body from a spec. */
export function flowBody(spec: FlowSpec): Json {
  return {
    name: spec.name ?? `e2e-flow-${flowSeq++}`,
    definition: {
      nodes: spec.nodes,
      edges: spec.edges ?? [],
      ...(spec.guardrails ? { guardrails: spec.guardrails } : {}),
    },
    trigger: spec.trigger ?? { type: "manual" },
    enabled: spec.enabled ?? true,
    overlapPolicy: spec.overlapPolicy ?? "skip",
    ...(spec.slaMs !== undefined ? { slaMs: spec.slaMs } : {}),
    ...(spec.requiresApproval !== undefined ? { requiresApproval: spec.requiresApproval } : {}),
  }
}

export interface CreatedFlow {
  id: string
  name: string
  [k: string]: unknown
}

/** Create a flow via the API and return its row (throws on validation failure). */
export async function createFlow(spec: FlowSpec, client?: ApiClient): Promise<CreatedFlow> {
  const c = client ?? (await admin())
  const res = await c.post<CreatedFlow>("/api/flows", flowBody(spec))
  if (res.status >= 300) {
    throw new Error(`createFlow failed: ${res.status} ${JSON.stringify(res.body)}`)
  }
  return res.body
}

/** Trigger a manual run and return the run id. */
export async function manualRun(
  flowId: string,
  body: Json = {},
  client?: ApiClient,
): Promise<string> {
  const c = client ?? (await admin())
  const res = await c.post<{ id: string }>(`/api/flows/${flowId}/run`, body)
  if (res.status >= 300) {
    throw new Error(`manualRun failed: ${res.status} ${JSON.stringify(res.body)}`)
  }
  return res.body.id
}

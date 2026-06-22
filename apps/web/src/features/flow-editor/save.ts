// Copyright 2026 The tempo-flow Authors
// SPDX-License-Identifier: Apache-2.0

import { type FlowPayload, api } from "@/lib/api"
import { type FlowEditorState, toTrigger } from "./state"

export interface SaveResult {
  ok: boolean
  errors: string[]
  flowId?: string
}

/**
 * Light client-side checks, then create/update. The server runs full DAG
 * validation (cycles, unknown edges, cron expr) and returns 400 with an
 * `errors` array, which we surface to the user.
 */
export async function saveFlow(
  state: FlowEditorState,
  existingId: string | null,
): Promise<SaveResult> {
  const errors: string[] = []
  if (!state.name.trim()) errors.push("Name is required")
  if (state.triggerType === "cron" && !state.cronExpr.trim()) {
    errors.push("Cron expression is required")
  }
  if (state.definition.nodes.length === 0) errors.push("Add at least one node")
  if (errors.length > 0) return { ok: false, errors }

  const payload: FlowPayload = {
    name: state.name.trim(),
    description: state.description.trim() || undefined,
    definition: state.definition,
    trigger: toTrigger(state),
    enabled: state.enabled,
    overlapPolicy: state.overlapPolicy,
    slaMs: state.slaSeconds > 0 ? state.slaSeconds * 1000 : undefined,
  }

  try {
    const flow = existingId
      ? await api.updateFlow(existingId, payload)
      : await api.createFlow(payload)
    return { ok: true, errors: [], flowId: flow.id }
  } catch (e) {
    return { ok: false, errors: [serverError(e)] }
  }
}

/** Extract the server's validation errors from a thrown request error. */
function serverError(e: unknown): string {
  const message = e instanceof Error ? e.message : String(e)
  const jsonStart = message.indexOf("{")
  if (jsonStart >= 0) {
    try {
      const body = JSON.parse(message.slice(jsonStart)) as { errors?: string[]; message?: string }
      if (body.errors?.length) return body.errors.join("; ")
      if (body.message) return body.message
    } catch {
      // fall through
    }
  }
  return message
}

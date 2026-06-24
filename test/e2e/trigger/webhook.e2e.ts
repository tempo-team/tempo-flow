// Copyright 2026 The tempo-flow Authors
// SPDX-License-Identifier: Apache-2.0
//
// Webhook trigger: POST /api/hooks/:token with an HMAC signature over the raw
// body launches a run; bad/missing signatures are 401; >60/min returns 429.

import { createHmac } from "node:crypto"
import { describe, expect, it } from "vitest"
import { BASE_URL } from "../setup/config"
import { createFlow, httpNode } from "../setup/builders"
import { admin } from "../setup/client"
import { nodeRun, waitForTerminal } from "../setup/wait"

function sign(body: string, secret: string): string {
  return createHmac("sha256", secret).update(body).digest("hex")
}

async function registerWebhook(
  flowId: string,
  withSecret = true,
): Promise<{ token: string; secret?: string }> {
  const c = await admin()
  const res = await c.post<{ id: string; token: string; secret?: string }>(
    `/api/flows/${flowId}/webhooks`,
    { withSecret },
  )
  if (res.status >= 300) throw new Error(`webhook register failed: ${res.status}`)
  return { token: res.body.token, secret: res.body.secret }
}

function hook(token: string, body: string, signature?: string): Promise<Response> {
  const headers: Record<string, string> = { "content-type": "application/json" }
  if (signature) headers["x-tempo-signature"] = signature
  return fetch(`${BASE_URL}/api/hooks/${token}`, { method: "POST", headers, body })
}

describe("webhook trigger", () => {
  it("launches a run on a valid signature, passing body fields as params", async () => {
    const flow = await createFlow({ nodes: [httpNode("a", "/echo")] })
    const { token, secret } = await registerWebhook(flow.id, true)
    const body = JSON.stringify({ userId: "123", count: 5 })

    const res = await hook(token, body, sign(body, secret!))
    expect(res.status).toBe(202)
    const { runId } = (await res.json()) as { runId: string }

    const run = await waitForTerminal(runId)
    expect(run.status).toBe("SUCCESS")
    expect(run.trigger).toBe("webhook")
    const params = (nodeRun(run, "a")?.request as { params?: Record<string, string> }).params
    expect(params?.userId).toBe("123")
    expect(params?.count).toBe("5")
  })

  it("rejects a bad signature with 401 and creates no run", async () => {
    const flow = await createFlow({ nodes: [httpNode("a", "/echo")] })
    const { token } = await registerWebhook(flow.id, true)
    const body = JSON.stringify({ x: 1 })

    const res = await hook(token, body, "deadbeef")
    expect(res.status).toBe(401)

    const c = await admin()
    const runs = await c.get<unknown[]>(`/api/flows/${flow.id}/runs`)
    expect(runs.body).toHaveLength(0)
  })

  it("rejects a missing signature when a secret is set (401)", async () => {
    const flow = await createFlow({ nodes: [httpNode("a", "/echo")] })
    const { token } = await registerWebhook(flow.id, true)
    const res = await hook(token, JSON.stringify({ x: 1 }))
    expect(res.status).toBe(401)
  })

  it("rate-limits at >60 requests/min per token (429)", async () => {
    const flow = await createFlow({ nodes: [httpNode("a", "/echo")] })
    // Secret set + bad signature → each request passes the rate-limit guard but
    // is rejected (401) by the handler, so no runs are created while we probe.
    const { token } = await registerWebhook(flow.id, true)
    const body = JSON.stringify({ x: 1 })

    const statuses: number[] = []
    for (let i = 0; i < 61; i++) {
      statuses.push((await hook(token, body, "bad")).status)
    }
    // First 60 reach the handler (401); the 61st is blocked by the limiter (429).
    expect(statuses.slice(0, 60).every((s) => s === 401)).toBe(true)
    expect(statuses[60]).toBe(429)
  })
})

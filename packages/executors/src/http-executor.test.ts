// Copyright 2026 The tempo-flow Authors
// SPDX-License-Identifier: Apache-2.0

import type { FlowNode } from "@tempo-flow/shared-types"
import { describe, expect, it } from "vitest"
import type { RunContext } from "./executor.js"
import { HttpExecutor } from "./http-executor.js"

const ctx: RunContext = { flowRunId: "run-1", nodeId: "n1", runDate: new Date(2026, 5, 20) }

function node(extra: Partial<FlowNode> = {}): FlowNode {
  return {
    id: "n1",
    name: "call",
    executor: { type: "http", url: "https://api.test/run", method: "POST" },
    params: { dateParams: [{ key: "startAt", expr: "${RUN_DATE-1d}", format: "yyyyMMdd" }] },
    ...extra,
  }
}

function okFetch(capture: { url?: string }): typeof fetch {
  return (async (url: string) => {
    capture.url = url
    return { ok: true, status: 200, text: async () => '{"done":true}' }
  }) as unknown as typeof fetch
}

describe("HttpExecutor", () => {
  it("sends resolved date params as query string and succeeds on 2xx", async () => {
    const capture: { url?: string } = {}
    const exec = new HttpExecutor(okFetch(capture))
    const result = await exec.execute(node(), ctx)
    expect(result.ok).toBe(true)
    expect(capture.url).toContain("startAt=20260619")
    expect((result.response as { status: number }).status).toBe(200)
  })

  it("marks non-2xx as failure", async () => {
    const fetch500 = (async () => ({
      ok: false,
      status: 500,
      text: async () => "boom",
    })) as unknown as typeof fetch
    const exec = new HttpExecutor(fetch500)
    const result = await exec.execute(node(), ctx)
    expect(result.ok).toBe(false)
    expect(result.errorMessage).toContain("500")
  })

  it("times out a slow request", async () => {
    const slowFetch = ((_url: string, opts: { signal: AbortSignal }) =>
      new Promise((_resolve, reject) => {
        opts.signal.addEventListener("abort", () => {
          const err = new Error("aborted")
          err.name = "AbortError"
          reject(err)
        })
      })) as unknown as typeof fetch
    const exec = new HttpExecutor(slowFetch)
    const result = await exec.execute(node({ timeoutMs: 20 }), ctx)
    expect(result.ok).toBe(false)
    expect(result.errorMessage).toContain("timeout")
  })

  it("sends params as JSON body when paramsIn=body", async () => {
    let sentBody: string | undefined
    const bodyFetch = ((_url: string, opts: { body?: string }) => {
      sentBody = opts.body
      return Promise.resolve({ ok: true, status: 200, text: async () => "ok" })
    }) as unknown as typeof fetch
    const exec = new HttpExecutor(bodyFetch)
    const n = node({
      executor: { type: "http", url: "https://api.test/run", method: "POST", paramsIn: "body" },
    })
    await exec.execute(n, ctx)
    expect(JSON.parse(sentBody ?? "{}")).toEqual({ startAt: "20260619" })
  })
})

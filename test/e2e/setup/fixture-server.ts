// Copyright 2026 The tempo-flow Authors
// SPDX-License-Identifier: Apache-2.0
//
// Local HTTP server the tests point flow nodes at. It is the controllable
// "outside world" for the HTTP executor and the async-completion callback path.
// Runs in the global-setup (main) process; because tests run in a separate fork,
// recorded calls are exposed over HTTP (GET /__calls, POST /__reset) so tests can
// assert on them cross-process.
//
// Endpoints:
//   ANY  /echo                 → 200 { method, query, headers, body }
//   ANY  /fail/:code           → returns the given status code
//   ANY  /flaky/:n?key=K       → first n calls per key fail (500), then 200
//   ANY  /slow/:ms             → responds after ms (timeout testing)
//   ANY  /async-callback       → 200 now, then POSTs the result to the callback URL
//   GET  /__calls?path=/echo   → recorded calls (optionally filtered by path prefix)
//   POST /__reset              → clear recorded calls + flaky counters

import { type IncomingMessage, type Server, type ServerResponse, createServer } from "node:http"
import { FIXTURE_PORT_NUM } from "./config"

interface RecordedCall {
  path: string
  method: string
  query: Record<string, string>
  headers: Record<string, string>
  body: unknown
  at: number
}

let server: Server | undefined
const calls: RecordedCall[] = []
const flakyCounts = new Map<string, number>()

function readBody(req: IncomingMessage): Promise<string> {
  return new Promise((resolvePromise) => {
    let data = ""
    req.on("data", (c) => (data += c))
    req.on("end", () => resolvePromise(data))
  })
}

function sendJson(res: ServerResponse, status: number, payload: unknown): void {
  const body = JSON.stringify(payload)
  res.writeHead(status, { "content-type": "application/json" })
  res.end(body)
}

async function handle(req: IncomingMessage, res: ServerResponse): Promise<void> {
  const url = new URL(req.url ?? "/", `http://127.0.0.1:${FIXTURE_PORT_NUM}`)
  const path = url.pathname
  const query = Object.fromEntries(url.searchParams.entries())
  const headers = req.headers as Record<string, string>
  const rawBody = await readBody(req)
  let body: unknown = rawBody
  try {
    body = rawBody ? JSON.parse(rawBody) : undefined
  } catch {
    /* leave as raw string */
  }

  // --- introspection (not recorded) ---
  if (path === "/__calls") {
    const filter = url.searchParams.get("path")
    const out = filter ? calls.filter((c) => c.path.startsWith(filter)) : calls
    return sendJson(res, 200, out)
  }
  if (path === "/__reset") {
    calls.length = 0
    flakyCounts.clear()
    return sendJson(res, 200, { ok: true })
  }

  calls.push({ path, method: req.method ?? "GET", query, headers, body, at: Date.now() })

  // --- behaviors ---
  if (path === "/echo") {
    return sendJson(res, 200, { method: req.method, query, headers, body })
  }

  if (path.startsWith("/fail/")) {
    const code = Number(path.split("/")[2]) || 500
    return sendJson(res, code, { error: `forced ${code}` })
  }

  if (path.startsWith("/flaky/")) {
    const n = Number(path.split("/")[2]) || 1
    const key = url.searchParams.get("key") ?? "default"
    const seen = flakyCounts.get(key) ?? 0
    flakyCounts.set(key, seen + 1)
    if (seen < n) return sendJson(res, 500, { error: `flaky attempt ${seen + 1}/${n}` })
    return sendJson(res, 200, { ok: true, attempt: seen + 1 })
  }

  if (path.startsWith("/slow/")) {
    const ms = Number(path.split("/")[2]) || 1000
    await new Promise((r) => setTimeout(r, ms))
    return sendJson(res, 200, { ok: true, sleptMs: ms })
  }

  // Fail for specific fan-out items: /fail-items?fail=2,4 → 500 when query.item ∈ fail.
  if (path === "/fail-items") {
    const fail = (url.searchParams.get("fail") ?? "").split(",")
    const item = query.item ?? ""
    if (fail.includes(item)) return sendJson(res, 500, { error: `forced fail for item ${item}` })
    return sendJson(res, 200, { ok: true, item })
  }

  // Sink for outbound notifications (the configured webhook channel POSTs here).
  if (path === "/notify-sink") {
    return sendJson(res, 200, { ok: true })
  }

  if (path === "/async-callback") {
    const callbackUrl = headers["x-tempo-callback-url"]
    const status = url.searchParams.get("status") ?? "success"
    const delayMs = Number(url.searchParams.get("delayMs") ?? "50")
    // times=0 → ack only, never report (drives callback-timeout); times>1 → report
    // repeatedly (drives duplicate-callback idempotency).
    const times = Number(url.searchParams.get("times") ?? "1")
    const outputRaw = url.searchParams.get("output")
    const output = outputRaw ? JSON.parse(outputRaw) : { echoed: query }
    // Ack immediately; report the real completion out of band.
    sendJson(res, 200, { accepted: true })
    if (callbackUrl && times > 0) {
      const reportBody =
        status === "failure"
          ? { status: "failure", errorMessage: "fixture reported failure" }
          : { status: "success", output }
      for (let i = 0; i < times; i++) {
        setTimeout(
          () => {
            void fetch(callbackUrl, {
              method: "POST",
              headers: { "content-type": "application/json" },
              body: JSON.stringify(reportBody),
            }).catch(() => undefined)
          },
          delayMs + i * 100,
        )
      }
    }
    return
  }

  return sendJson(res, 404, { error: "not found", path })
}

export async function startFixture(): Promise<void> {
  if (server) return
  server = createServer((req, res) => {
    void handle(req, res).catch((err) => {
      sendJson(res, 500, { error: (err as Error).message })
    })
  })
  await new Promise<void>((resolvePromise) =>
    server!.listen(FIXTURE_PORT_NUM, "127.0.0.1", resolvePromise),
  )
}

export async function stopFixture(): Promise<void> {
  const s = server
  server = undefined
  if (!s) return
  await new Promise<void>((resolvePromise) => s.close(() => resolvePromise()))
}

// Copyright 2026 The tempo-flow Authors
// SPDX-License-Identifier: Apache-2.0
//
// Runs the real API (apps/api/dist/main.js) as a subprocess against the isolated
// E2E infra — a faithful black-box. Exposes start/stop/restart so failure-phase
// tests can simulate a worker crash by actually killing and respawning the
// process (durable checkpoint-resume must survive this).

import { type ChildProcess, spawn } from "node:child_process"
import { setTimeout as sleep } from "node:timers/promises"
import { APP_PORT_NUM, BASE_URL, REPO_ROOT, appEnv } from "./config"

const MAIN = "apps/api/dist/main.js"

let proc: ChildProcess | undefined

async function waitForHealth(timeoutMs = 60_000): Promise<void> {
  const deadline = Date.now() + timeoutMs
  let lastErr = ""
  while (Date.now() < deadline) {
    try {
      const res = await fetch(`${BASE_URL}/health`)
      if (res.ok) return
      lastErr = `status ${res.status}`
    } catch (err) {
      lastErr = (err as Error).message
    }
    await sleep(300)
  }
  throw new Error(`API did not become healthy at ${BASE_URL}/health: ${lastErr}`)
}

export async function startApp(): Promise<void> {
  if (proc) return
  proc = spawn("node", [MAIN], {
    cwd: REPO_ROOT,
    env: appEnv(),
    stdio: ["ignore", "inherit", "inherit"],
  })
  proc.on("exit", (code, signal) => {
    // Unexpected exit (not from stopApp) — surface it; tests will fail on connect.
    if (proc && code !== 0 && signal !== "SIGTERM" && signal !== "SIGKILL") {
      console.error(`[e2e] api subprocess exited unexpectedly: code=${code} signal=${signal}`)
    }
  })
  await waitForHealth()
}

export async function stopApp(signal: NodeJS.Signals = "SIGTERM"): Promise<void> {
  const p = proc
  proc = undefined
  if (!p) return
  await new Promise<void>((resolvePromise) => {
    p.on("exit", () => resolvePromise())
    p.kill(signal)
    // Hard-kill backstop if it ignores the signal.
    setTimeout(() => p.kill("SIGKILL"), 5_000).unref()
  })
}

/** Kill (default: hard) and start again — used by worker-crash/durability tests. */
export async function restartApp(signal: NodeJS.Signals = "SIGKILL"): Promise<void> {
  await stopApp(signal)
  await startApp()
}

export const appPort = APP_PORT_NUM

export interface ExtraInstance {
  stop(): Promise<void>
}

/**
 * Spawn an additional API instance on its own port against the SAME DB + Redis.
 * Used to prove distributed behaviors (e.g. the scheduler's Redis tick lock
 * deduplicates a cron tick across instances). Its scheduler registers enabled
 * flows at boot, so create the flow BEFORE spawning. Worker is off by default so
 * only the primary executes runs.
 */
export async function spawnInstance(
  port: number,
  opts: { worker?: boolean } = {},
): Promise<ExtraInstance> {
  const url = `http://127.0.0.1:${port}`
  const child = spawn("node", [MAIN], {
    cwd: REPO_ROOT,
    env: {
      ...appEnv(),
      PORT: String(port),
      PUBLIC_URL: url,
      WORKER_ENABLED: opts.worker ? "true" : "false",
    },
    stdio: ["ignore", "inherit", "inherit"],
  })
  // Wait for health on the secondary port.
  const deadline = Date.now() + 60_000
  for (;;) {
    try {
      if ((await fetch(`${url}/health`)).ok) break
    } catch {
      /* not up yet */
    }
    if (Date.now() > deadline) throw new Error(`secondary API not healthy on :${port}`)
    await sleep(300)
  }
  return {
    stop: () =>
      new Promise<void>((resolvePromise) => {
        child.on("exit", () => resolvePromise())
        child.kill("SIGKILL")
        setTimeout(() => resolvePromise(), 5_000).unref()
      }),
  }
}

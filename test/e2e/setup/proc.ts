// Copyright 2026 The tempo-flow Authors
// SPDX-License-Identifier: Apache-2.0
//
// Small process helpers: run a command to completion, and run a docker-compose
// command against the isolated E2E project. No external deps — just child_process.

import { spawn } from "node:child_process"
import { COMPOSE_FILE, COMPOSE_PROJECT, REPO_ROOT } from "./config"

export interface RunOptions {
  cwd?: string
  env?: NodeJS.ProcessEnv
  /** Inherit stdio to the console (default) or capture it. */
  capture?: boolean
}

export interface RunResult {
  code: number | null
  stdout: string
  stderr: string
}

/** Run a command to completion; rejects on non-zero exit. */
export function run(cmd: string, args: string[], opts: RunOptions = {}): Promise<RunResult> {
  return new Promise((resolvePromise, reject) => {
    const child = spawn(cmd, args, {
      cwd: opts.cwd ?? REPO_ROOT,
      env: opts.env ?? process.env,
      stdio: opts.capture ? ["ignore", "pipe", "pipe"] : "inherit",
    })
    let stdout = ""
    let stderr = ""
    child.stdout?.on("data", (d) => (stdout += d.toString()))
    child.stderr?.on("data", (d) => (stderr += d.toString()))
    child.on("error", reject)
    child.on("close", (code) => {
      if (code === 0) resolvePromise({ code, stdout, stderr })
      else reject(new Error(`${cmd} ${args.join(" ")} exited ${code}\n${stderr || stdout}`))
    })
  })
}

const composeBase = ["compose", "-f", COMPOSE_FILE, "-p", COMPOSE_PROJECT]

export function compose(args: string[], opts: RunOptions = {}): Promise<RunResult> {
  return run("docker", [...composeBase, ...args], opts)
}

/** Run `redis-cli <args>` inside the e2e redis container. */
export async function redisCli(args: string[]): Promise<string> {
  const { stdout } = await compose(["exec", "-T", "redis", "redis-cli", ...args], {
    capture: true,
  })
  return stdout.trim()
}

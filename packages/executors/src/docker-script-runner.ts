// Copyright 2026 The tempo-flow Authors
// SPDX-License-Identifier: Apache-2.0

import { spawn } from "node:child_process"
import { randomBytes } from "node:crypto"
import type { ScriptLanguage } from "@tempo-flow/shared-types"
import {
  DEFAULT_SCRIPT_IMAGES,
  type ScriptRunResult,
  type ScriptRunSpec,
  type ScriptRunner,
} from "./script-executor.js"

const MEMORY = "512m"
const CPUS = "1"
const PIDS = "256"

/**
 * Runs each script as a one-shot, isolated container via the Docker CLI
 * (Docker-out-of-Docker). The source is piped to the interpreter over STDIN so
 * there is no host-path volume mount — which would otherwise break when the
 * worker is itself a container talking to the host daemon. Isolation: no
 * network by default, capped memory/cpu/pids, `--rm`.
 */
export class DockerScriptRunner implements ScriptRunner {
  constructor(private readonly dockerPath: string = "docker") {}

  /** Build the `docker run` argv for a spec (exposed for testing). */
  buildArgs(spec: ScriptRunSpec, name: string): string[] {
    const image = spec.image ?? DEFAULT_SCRIPT_IMAGES[spec.language]
    const args = [
      "run",
      "--rm",
      "-i",
      "--name",
      name,
      "--memory",
      MEMORY,
      "--cpus",
      CPUS,
      "--pids-limit",
      PIDS,
    ]
    if (!spec.network) args.push("--network", "none")
    for (const [key, value] of Object.entries(spec.env)) args.push("-e", `${key}=${value}`)
    args.push(image, ...interpreter(spec.language))
    return args
  }

  run(spec: ScriptRunSpec): Promise<ScriptRunResult> {
    const name = `tempo-script-${randomBytes(8).toString("hex")}`
    const args = this.buildArgs(spec, name)
    return new Promise((resolve) => {
      const child = spawn(this.dockerPath, args, { stdio: ["pipe", "pipe", "pipe"] })
      let stdout = ""
      let stderr = ""
      let timedOut = false

      const timer = setTimeout(() => {
        timedOut = true
        // Killing the client doesn't stop the container — kill it by name too.
        spawn(this.dockerPath, ["kill", name]).on("error", () => undefined)
        child.kill("SIGKILL")
      }, spec.timeoutMs)

      child.stdout.on("data", (chunk: Buffer) => {
        stdout += chunk.toString()
        for (const line of chunk.toString().split("\n")) if (line) spec.onLog?.(line)
      })
      child.stderr.on("data", (chunk: Buffer) => {
        stderr += chunk.toString()
        for (const line of chunk.toString().split("\n")) if (line) spec.onLog?.(line)
      })
      child.on("error", (err) => {
        clearTimeout(timer)
        resolve({ exitCode: 127, stdout, stderr: stderr + `\n${err.message}`, timedOut })
      })
      child.on("close", (code) => {
        clearTimeout(timer)
        resolve({ exitCode: code ?? 1, stdout, stderr, timedOut })
      })

      child.stdin.on("error", () => undefined) // ignore EPIPE if the container exits early
      child.stdin.write(spec.code)
      child.stdin.end()
    })
  }
}

/** How each language reads its source from STDIN (no file on disk needed). */
function interpreter(language: ScriptLanguage): string[] {
  switch (language) {
    case "python":
      return ["python3", "/dev/stdin"]
    case "node":
      return ["node", "/dev/stdin"]
    case "bash":
      return ["sh", "/dev/stdin"]
    case "go":
      // Go needs a file; stream stdin into one, then run it.
      return ["sh", "-c", "cat > /tmp/main.go && go run /tmp/main.go"]
  }
}

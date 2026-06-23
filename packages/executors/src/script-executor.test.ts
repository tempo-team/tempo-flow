// Copyright 2026 The tempo-flow Authors
// SPDX-License-Identifier: Apache-2.0

import type { FlowNode } from "@tempo-flow/shared-types"
import { describe, expect, it } from "vitest"
import { DockerScriptRunner } from "./docker-script-runner.js"
import type { RunContext } from "./executor.js"
import {
  ScriptExecutor,
  type ScriptRunResult,
  type ScriptRunSpec,
  type ScriptRunner,
} from "./script-executor.js"

const ctx: RunContext = { flowRunId: "run-1", nodeId: "n1", runDate: new Date(2026, 5, 20) }

function scriptNode(extra: Partial<FlowNode> = {}): FlowNode {
  return {
    id: "n1",
    name: "calc",
    executor: { type: "script", language: "python", code: "print('{\"rows\": 3}')" },
    params: { static: { region: "kr" } },
    ...extra,
  }
}

function fakeRunner(result: Partial<ScriptRunResult>): {
  runner: ScriptRunner
  seen: ScriptRunSpec[]
} {
  const seen: ScriptRunSpec[] = []
  const runner: ScriptRunner = {
    async run(spec) {
      seen.push(spec)
      return { exitCode: 0, stdout: "", stderr: "", ...result }
    },
  }
  return { runner, seen }
}

describe("ScriptExecutor", () => {
  it("injects params as TF_PARAM_* and TEMPO_PARAMS, succeeds on exit 0", async () => {
    const { runner, seen } = fakeRunner({ exitCode: 0, stdout: '{"rows": 3}' })
    const result = await new ScriptExecutor(runner).execute(scriptNode(), ctx)
    expect(result.ok).toBe(true)
    expect(result.output).toEqual({ rows: 3 })
    expect(seen[0].env.TF_PARAM_REGION).toBe("kr")
    expect(JSON.parse(seen[0].env.TEMPO_PARAMS)).toEqual({ region: "kr" })
    expect(seen[0].network).toBe(false) // isolated by default
  })

  it("captures the LAST json line of stdout as output", async () => {
    const { runner } = fakeRunner({ stdout: 'log line\nnot json\n{"ok": true, "n": 7}' })
    const result = await new ScriptExecutor(runner).execute(scriptNode(), ctx)
    expect(result.output).toEqual({ ok: true, n: 7 })
  })

  it("fails the node on a non-zero exit, surfacing the last stderr line", async () => {
    const { runner } = fakeRunner({ exitCode: 2, stderr: "Traceback\nValueError: boom" })
    const result = await new ScriptExecutor(runner).execute(scriptNode(), ctx)
    expect(result.ok).toBe(false)
    expect(result.errorMessage).toBe("ValueError: boom")
  })

  it("fails on timeout", async () => {
    const { runner } = fakeRunner({ exitCode: 137, timedOut: true })
    const result = await new ScriptExecutor(runner).execute(scriptNode({ timeoutMs: 1000 }), ctx)
    expect(result.ok).toBe(false)
    expect(result.errorMessage).toMatch(/timed out/)
  })

  it("passes callback env when the node is in callback mode", async () => {
    const { runner, seen } = fakeRunner({ stdout: "" })
    const cbCtx: RunContext = { ...ctx, callback: { url: "https://h/api/callbacks/t", token: "t" } }
    await new ScriptExecutor(runner).execute(scriptNode(), cbCtx)
    expect(seen[0].env.TEMPO_CALLBACK_URL).toBe("https://h/api/callbacks/t")
    expect(seen[0].env.TEMPO_CALLBACK_TOKEN).toBe("t")
  })
})

describe("DockerScriptRunner.buildArgs", () => {
  const spec: ScriptRunSpec = {
    language: "python",
    code: "print(1)",
    env: { TF_PARAM_X: "1" },
    network: false,
    timeoutMs: 1000,
  }

  it("isolates by default: --network none, resource caps, stdin interpreter", () => {
    const args = new DockerScriptRunner().buildArgs(spec, "tempo-script-abc")
    expect(args).toContain("--network")
    expect(args).toContain("none")
    expect(args).toEqual(expect.arrayContaining(["--memory", "512m", "--cpus", "1"]))
    expect(args).toEqual(expect.arrayContaining(["-e", "TF_PARAM_X=1"]))
    // interpreter reads source from stdin
    expect(args.slice(-2)).toEqual(["python3", "/dev/stdin"])
  })

  it("allows network when requested", () => {
    const args = new DockerScriptRunner().buildArgs({ ...spec, network: true }, "n")
    expect(args).not.toContain("none")
  })

  it("uses default image per language", () => {
    const args = new DockerScriptRunner().buildArgs({ ...spec, language: "node" }, "n")
    expect(args).toContain("node:24-alpine")
    expect(args.slice(-2)).toEqual(["node", "/dev/stdin"])
  })
})

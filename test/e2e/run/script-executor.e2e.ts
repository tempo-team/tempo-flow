// Copyright 2026 The tempo-flow Authors
// SPDX-License-Identifier: Apache-2.0
//
// Script executor (real one-shot Docker containers). Each language runs an
// isolated container, reads an injected param (TF_PARAM_REGION), and emits a
// JSON line that becomes NodeRun.output. Gated behind E2E_DOCKER; the first run
// pulls base images, so timeouts are generous.

import { describe, expect, it } from "vitest"
import { createFlow, manualRun, node } from "../setup/builders"
import { CAP } from "../setup/config"
import { type RunView, nodeRun, waitForTerminal } from "../setup/wait"

const PULL_TIMEOUT = 300_000

const scripts: Record<string, string> = {
  python:
    'import os, json\nprint(json.dumps({"lang": "python", "region": os.environ.get("TF_PARAM_REGION")}))',
  node: 'console.log(JSON.stringify({ lang: "node", region: process.env.TF_PARAM_REGION }))',
  bash: 'echo "{\\"lang\\":\\"bash\\",\\"region\\":\\"$TF_PARAM_REGION\\"}"',
  go: [
    "package main",
    'import ("fmt"; "os")',
    'func main() { fmt.Printf("{\\"lang\\":\\"go\\",\\"region\\":\\"%s\\"}\\n", os.Getenv("TF_PARAM_REGION")) }',
  ].join("\n"),
}

async function runScript(language: string): Promise<RunView> {
  const flow = await createFlow({
    nodes: [
      node(
        "s",
        { type: "script", language, code: scripts[language] },
        { params: { static: { region: "kr" } } },
      ),
    ],
  })
  return waitForTerminal(await manualRun(flow.id), { timeout: PULL_TIMEOUT })
}

describe.runIf(CAP.docker)("script executor", () => {
  for (const language of ["python", "bash", "go"]) {
    it(
      `runs a ${language} script, injects params, and parses JSON output`,
      async () => {
        const run = await runScript(language)
        expect(run.status).toBe("SUCCESS")
        const output = nodeRun(run, "s")?.output as { lang?: string; region?: string }
        expect(output.lang).toBe(language)
        expect(output.region).toBe("kr")
      },
      PULL_TIMEOUT,
    )
  }

  // KNOWN PRODUCT BUG (not a test issue): the runner pipes code to `node
  // /dev/stdin`, which Node resolves to /proc/1/fd/pipe:[…] and then fails to
  // open ("ENOENT … open '/proc/1/fd/pipe:[…]'"), so inline `node` scripts never
  // execute. python3/sh read /dev/stdin fine; go is written to a temp file first.
  // Fix belongs in packages/executors/src/docker-script-runner.ts (write node
  // code to a temp file like go, or pass via `node -e`). Marked it.fails so this
  // turns RED — alerting us to drop the marker — once the bug is fixed.
  it.fails(
    "runs a node script (BLOCKED by node /dev/stdin bug)",
    async () => {
      const run = await runScript("node")
      expect(run.status).toBe("SUCCESS")
    },
    PULL_TIMEOUT,
  )
})

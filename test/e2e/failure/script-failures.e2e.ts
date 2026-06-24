// Copyright 2026 The tempo-flow Authors
// SPDX-License-Identifier: Apache-2.0
//
// Script executor failure modes: a non-zero exit surfaces stderr; an overrunning
// script is killed on timeout. Gated behind E2E_DOCKER.

import { describe, expect, it } from "vitest"
import { createFlow, manualRun, node } from "../setup/builders"
import { CAP } from "../setup/config"
import { nodeRun, waitForTerminal } from "../setup/wait"

const PULL_TIMEOUT = 300_000

describe.runIf(CAP.docker)("script failures", () => {
  it(
    "fails on a non-zero exit and surfaces stderr",
    async () => {
      const flow = await createFlow({
        nodes: [
          node("s", {
            type: "script",
            language: "python",
            code: 'import sys\nsys.stderr.write("boom\\n")\nsys.exit(2)',
          }),
        ],
      })
      const run = await waitForTerminal(await manualRun(flow.id), { timeout: PULL_TIMEOUT })
      expect(run.status).toBe("FAILED")
      expect(nodeRun(run, "s")?.errorMessage ?? "").toMatch(/boom|exit code 2/)
    },
    PULL_TIMEOUT,
  )

  it(
    "fails on a timeout",
    async () => {
      const flow = await createFlow({
        nodes: [
          node(
            "s",
            { type: "script", language: "python", code: "import time\ntime.sleep(30)" },
            { timeoutMs: 1500 },
          ),
        ],
      })
      const run = await waitForTerminal(await manualRun(flow.id), { timeout: PULL_TIMEOUT })
      expect(run.status).toBe("FAILED")
      expect(nodeRun(run, "s")?.errorMessage ?? "").toMatch(/time[d]? ?out/i)
    },
    PULL_TIMEOUT,
  )
})

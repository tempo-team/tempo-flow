// Copyright 2026 The tempo-flow Authors
// SPDX-License-Identifier: Apache-2.0
//
// LLM agent failure: exceeding maxToolTurns fails the node. Gated behind E2E_LLM
// and the Anthropic key (tool use is Anthropic-only).

import { describe, expect, it } from "vitest"
import { createFlow, httpNode, manualRun, node } from "../setup/builders"
import { admin } from "../setup/client"
import { CAP } from "../setup/config"
import { nodeRun, waitForTerminal } from "../setup/wait"

describe.runIf(CAP.llm && Boolean(process.env.ANTHROPIC_API_KEY))("llm agent failures", () => {
  it("fails when the tool loop exceeds maxToolTurns", async () => {
    const c = await admin()
    await c.post("/api/secrets", {
      key: "ANTHROPIC_API_KEY",
      value: process.env.ANTHROPIC_API_KEY,
      scope: "global",
    })
    const tool = await createFlow({ name: "tool", nodes: [httpNode("t", "/echo")] })
    const flow = await createFlow({
      nodes: [
        node("agent", {
          type: "llm",
          provider: "anthropic",
          prompt: "Call the ping tool repeatedly, at least 5 times, never finishing.",
          maxToolTurns: 1,
          tools: [
            {
              name: "ping",
              description: "A no-op tool.",
              inputSchema: { type: "object", properties: {} },
              flowId: tool.id,
            },
          ],
        }),
      ],
      guardrails: { allowedToolFlows: [tool.id] },
    })
    const run = await waitForTerminal(await manualRun(flow.id), { timeout: 120_000 })
    expect(run.status).toBe("FAILED")
    expect(nodeRun(run, "agent")?.errorMessage ?? "").toMatch(/turn/i)
  }, 120_000)
})

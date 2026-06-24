// Copyright 2026 The tempo-flow Authors
// SPDX-License-Identifier: Apache-2.0
//
// LLM executor: structured (JSON-schema) output across providers, plus the
// durable agentic tool-use loop (Anthropic) where a tool runs as a sub-flow and
// the node suspends/resumes around it. Gated behind E2E_LLM; each provider test
// also requires its API key in the environment (injected into the secret store).
//
// Assertions are on STRUCTURE (schema-shaped output / a tool call happened), not
// exact model text, so they're robust to model nondeterminism.

import { describe, expect, it } from "vitest"
import { createFlow, httpNode, manualRun, node } from "../setup/builders"
import { admin } from "../setup/client"
import { CAP } from "../setup/config"
import { type RunView, nodeRun, waitForTerminal } from "../setup/wait"

const PROVIDERS = [
  { id: "anthropic", secret: "ANTHROPIC_API_KEY" },
  { id: "openai", secret: "OPENAI_API_KEY" },
  { id: "gemini", secret: "GEMINI_API_KEY" },
] as const

const ANSWER_SCHEMA = {
  type: "object",
  properties: { answer: { type: "string" } },
  required: ["answer"],
  additionalProperties: false,
}

async function putKey(secret: string): Promise<void> {
  const c = await admin()
  await c.post("/api/secrets", { key: secret, value: process.env[secret], scope: "global" })
}

describe.runIf(CAP.llm)("llm executor", () => {
  for (const p of PROVIDERS) {
    const hasKey = Boolean(process.env[p.secret])
    it.runIf(hasKey)(
      `${p.id}: returns schema-shaped structured output`,
      async () => {
        await putKey(p.secret)
        const flow = await createFlow({
          nodes: [
            node("llm", {
              type: "llm",
              provider: p.id,
              prompt: 'Return a JSON object with an "answer" field set to the string "hello".',
              outputSchema: ANSWER_SCHEMA,
            }),
          ],
        })
        const run = await waitForTerminal(await manualRun(flow.id), { timeout: 120_000 })
        expect(run.status).toBe("SUCCESS")
        const output = nodeRun(run, "llm")?.output as { answer?: unknown }
        expect(typeof output.answer).toBe("string")
      },
      120_000,
    )
  }

  // Durable agentic tool-use (Anthropic only): the model calls a tool that runs
  // as a sub-flow; the node suspends and resumes around it.
  it.runIf(Boolean(process.env.ANTHROPIC_API_KEY))(
    "anthropic: drives an agentic tool call as a sub-flow",
    async () => {
      await putKey("ANTHROPIC_API_KEY")
      const tool = await createFlow({ name: "tool-flow", nodes: [httpNode("t", "/echo")] })
      const flow = await createFlow({
        nodes: [
          node("agent", {
            type: "llm",
            provider: "anthropic",
            prompt: 'Call the ping tool exactly once with {"x":1}, then reply that you are done.',
            tools: [
              {
                name: "ping",
                description: "A no-op tool used to verify tool calling.",
                inputSchema: { type: "object", properties: { x: { type: "number" } } },
                flowId: tool.id,
              },
            ],
          }),
        ],
        guardrails: { allowedToolFlows: [tool.id], maxSubflowDepth: 3 },
      })

      const run = await waitForTerminal(await manualRun(flow.id), { timeout: 180_000 })
      expect(run.status).toBe("SUCCESS")

      // The tool ran as a sub-flow (trigger=agent-tool) at least once.
      const c = await admin()
      const toolRuns = (await c.get<RunView[]>(`/api/flows/${tool.id}/runs`)).body
      expect(toolRuns.length).toBeGreaterThanOrEqual(1)
      expect(toolRuns[0].trigger).toBe("agent-tool")
    },
    180_000,
  )
})

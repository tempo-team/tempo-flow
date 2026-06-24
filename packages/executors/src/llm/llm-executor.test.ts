// Copyright 2026 The tempo-flow Authors
// SPDX-License-Identifier: Apache-2.0

import type { FlowNode } from "@tempo-flow/shared-types"
import { describe, expect, it } from "vitest"
import type { RunContext } from "../executor.js"
import type { LlmClient, LlmRequest, LlmResult } from "./llm-client.js"
import { LlmExecutor } from "./llm-executor.js"

function fakeClient(result: Partial<LlmResult> = {}): { client: LlmClient; seen: LlmRequest[] } {
  const seen: LlmRequest[] = []
  const client: LlmClient = {
    provider: "anthropic",
    defaultModel: "claude-opus-4-8",
    async complete(req) {
      seen.push(req)
      return {
        text: "hello",
        model: req.model,
        usage: { inputTokens: 10, outputTokens: 5 },
        ...result,
      }
    },
  }
  return { client, seen }
}

function node(executor: Record<string, unknown>): FlowNode {
  return { id: "n1", name: "ask", executor: executor as unknown as FlowNode["executor"] }
}

function ctx(extra: Partial<RunContext> = {}): RunContext {
  return {
    flowRunId: "run-1",
    nodeId: "n1",
    runDate: new Date(2026, 5, 24),
    secrets: { ANTHROPIC_API_KEY: "sk-test" },
    ...extra,
  }
}

describe("LlmExecutor", () => {
  it("resolves prompt/system expressions and forwards a request to the provider", async () => {
    const { client, seen } = fakeClient()
    const exec = new LlmExecutor({ anthropic: client })
    const result = await exec.execute(
      node({
        type: "llm",
        prompt: "Summarize: ={{ nodes.fetch.output.text }}",
        system: '={{ "You are " & "kr" }}',
        maxTokens: 1000,
        effort: "high",
      }),
      ctx({ nodeOutputs: { fetch: { output: { text: "a report" } } } }),
    )
    expect(result.ok).toBe(true)
    expect(seen[0].prompt).toBe("Summarize: a report")
    expect(seen[0].system).toBe("You are kr")
    expect(seen[0].model).toBe("claude-opus-4-8")
    expect(seen[0].maxTokens).toBe(1000)
    expect(seen[0].effort).toBe("high")
    expect(seen[0].apiKey).toBe("sk-test")
  })

  it("returns structured output when an outputSchema is set", async () => {
    const { client } = fakeClient({ structured: { label: "spam" }, text: '{"label":"spam"}' })
    const exec = new LlmExecutor({ anthropic: client })
    const result = await exec.execute(
      node({ type: "llm", prompt: "classify", outputSchema: { type: "object" } }),
      ctx(),
    )
    expect(result.output).toEqual({ label: "spam" })
  })

  it("wraps plain text output as { text } when no schema", async () => {
    const { client } = fakeClient({ text: "a summary" })
    const exec = new LlmExecutor({ anthropic: client })
    const result = await exec.execute(node({ type: "llm", prompt: "x" }), ctx())
    expect(result.output).toEqual({ text: "a summary" })
    expect(result.response).toMatchObject({ model: "claude-opus-4-8" })
  })

  it("fails with a clear message when the API key secret is missing", async () => {
    const { client, seen } = fakeClient()
    const exec = new LlmExecutor({ anthropic: client })
    const result = await exec.execute(node({ type: "llm", prompt: "x" }), ctx({ secrets: {} }))
    expect(result.ok).toBe(false)
    expect(result.errorMessage).toMatch(/ANTHROPIC_API_KEY/)
    expect(seen).toHaveLength(0) // never called the provider
  })

  it("never records the API key or prompt body in the request", async () => {
    const { client } = fakeClient()
    const exec = new LlmExecutor({ anthropic: client })
    const result = await exec.execute(
      node({ type: "llm", prompt: "secret prompt body" }),
      ctx({ secrets: { ANTHROPIC_API_KEY: "sk-leak" } }),
    )
    const json = JSON.stringify(result.request)
    expect(json).not.toContain("sk-leak")
    expect(json).not.toContain("secret prompt body")
    expect(result.request).toMatchObject({ provider: "anthropic", promptChars: 18 })
  })

  it("fails for an unregistered provider", async () => {
    const exec = new LlmExecutor({}) // no clients
    const result = await exec.execute(
      node({ type: "llm", provider: "openai", prompt: "x" }),
      ctx({ secrets: { OPENAI_API_KEY: "k" } }),
    )
    expect(result.ok).toBe(false)
    expect(result.errorMessage).toMatch(/openai/)
  })

  it("uses a custom apiKeySecret name when provided", async () => {
    const { client, seen } = fakeClient()
    const exec = new LlmExecutor({ anthropic: client })
    await exec.execute(
      node({ type: "llm", prompt: "x", apiKeySecret: "MY_KEY" }),
      ctx({ secrets: { MY_KEY: "sk-custom" } }),
    )
    expect(seen[0].apiKey).toBe("sk-custom")
  })

  describe("agentic tools", () => {
    const toolCfg = {
      type: "llm",
      prompt: "do it",
      tools: [
        {
          name: "lookup",
          description: "look something up",
          inputSchema: { type: "object" },
          flowId: "flow-tool",
        },
      ],
      maxToolTurns: 3,
    }

    it("delegates a tools node to the agent driver with resolved inputs", async () => {
      const { client } = fakeClient()
      const seen: unknown[] = []
      const exec = new LlmExecutor({ anthropic: client }, async (input) => {
        seen.push(input)
        return { ok: true, suspend: true, request: { tools: 1 } }
      })
      const result = await exec.execute(
        node({ ...toolCfg, prompt: "Summarize ={{ nodes.fetch.output.text }}" }),
        ctx({ nodeOutputs: { fetch: { output: { text: "a report" } } } }),
      )
      // The driver's ExecResult (suspend) is returned to the engine verbatim.
      expect(result).toMatchObject({ ok: true, suspend: true })
      expect(seen[0]).toMatchObject({
        model: "claude-opus-4-8",
        prompt: "Summarize a report", // ={{ }} resolved before delegation
        apiKey: "sk-test",
      })
    })

    it("fails when tools are set but no agent driver is configured", async () => {
      const { client } = fakeClient()
      const exec = new LlmExecutor({ anthropic: client }) // no driver
      const result = await exec.execute(node(toolCfg), ctx())
      expect(result.ok).toBe(false)
      expect(result.errorMessage).toMatch(/agent driver/i)
    })

    it("fails a tools node with a missing API key before delegating", async () => {
      const { client } = fakeClient()
      let called = false
      const exec = new LlmExecutor({ anthropic: client }, async () => {
        called = true
        return { ok: true }
      })
      const result = await exec.execute(node(toolCfg), ctx({ secrets: {} }))
      expect(result.ok).toBe(false)
      expect(result.errorMessage).toMatch(/ANTHROPIC_API_KEY/)
      expect(called).toBe(false)
    })

    it("rejects tool use for non-anthropic providers", async () => {
      const openai: LlmClient = { ...fakeClient().client, provider: "openai" }
      const exec = new LlmExecutor({ anthropic: fakeClient().client, openai }, async () => ({
        ok: true,
      }))
      const result = await exec.execute(
        node({ ...toolCfg, provider: "openai" }),
        ctx({ secrets: { OPENAI_API_KEY: "k" } }),
      )
      expect(result.ok).toBe(false)
      expect(result.errorMessage).toMatch(/anthropic/)
    })
  })
})

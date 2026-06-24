// Copyright 2026 The tempo-flow Authors
// SPDX-License-Identifier: Apache-2.0

import type Anthropic from "@anthropic-ai/sdk"
import { describe, expect, it, vi } from "vitest"
import { AnthropicClient } from "./anthropic-client.js"

function fakeSdk(content: unknown[], usage = { input_tokens: 12, output_tokens: 7 }) {
  const create = vi.fn().mockResolvedValue({ content, model: "claude-opus-4-8", usage })
  const sdk = { messages: { create } } as unknown as Anthropic
  return { sdk, create }
}

describe("AnthropicClient", () => {
  it("maps text blocks + usage into an LlmResult", async () => {
    const { sdk, create } = fakeSdk([
      { type: "thinking", thinking: "..." },
      { type: "text", text: "Hello " },
      { type: "text", text: "world" },
    ])
    const client = new AnthropicClient(() => sdk)
    const result = await client.complete({ apiKey: "k", model: "claude-opus-4-8", prompt: "hi" })

    expect(result.text).toBe("Hello world")
    expect(result.model).toBe("claude-opus-4-8")
    expect(result.usage).toEqual({ inputTokens: 12, outputTokens: 7 })
    // adaptive thinking + the prompt are passed through
    const body = create.mock.calls[0][0]
    expect(body.model).toBe("claude-opus-4-8")
    expect(body.thinking).toEqual({ type: "adaptive" })
    expect(body.messages[0]).toEqual({ role: "user", content: "hi" })
  })

  it("forces structured JSON output when an outputSchema is supplied", async () => {
    const { sdk, create } = fakeSdk([{ type: "text", text: '{"label":"spam"}' }])
    const client = new AnthropicClient(() => sdk)
    const schema = { type: "object", properties: { label: { type: "string" } } }
    const result = await client.complete({
      apiKey: "k",
      model: "claude-opus-4-8",
      prompt: "classify",
      outputSchema: schema,
    })

    expect(result.structured).toEqual({ label: "spam" })
    const body = create.mock.calls[0][0]
    expect(body.output_config.format).toEqual({ type: "json_schema", schema })
  })

  it("passes system and effort through", async () => {
    const { sdk, create } = fakeSdk([{ type: "text", text: "ok" }])
    const client = new AnthropicClient(() => sdk)
    await client.complete({
      apiKey: "k",
      model: "claude-opus-4-8",
      prompt: "x",
      system: "be terse",
      effort: "high",
    })
    const body = create.mock.calls[0][0]
    expect(body.system).toBe("be terse")
    expect(body.output_config.effort).toBe("high")
  })

  it("caches one SDK client per API key", async () => {
    const factory = vi.fn(() => fakeSdk([{ type: "text", text: "ok" }]).sdk)
    const client = new AnthropicClient(factory)
    await client.complete({ apiKey: "k1", model: "m", prompt: "a" })
    await client.complete({ apiKey: "k1", model: "m", prompt: "b" })
    await client.complete({ apiKey: "k2", model: "m", prompt: "c" })
    expect(factory).toHaveBeenCalledTimes(2) // k1 reused, k2 new
  })

  describe("tool-use loop", () => {
    it("runs each requested tool, feeds results back, and returns the final text", async () => {
      // Turn 1: model asks for a tool. Turn 2: model answers.
      const create = vi
        .fn()
        .mockResolvedValueOnce({
          content: [{ type: "tool_use", id: "tu_1", name: "lookup", input: { q: "weather" } }],
          model: "claude-opus-4-8",
          stop_reason: "tool_use",
          usage: { input_tokens: 10, output_tokens: 4 },
        })
        .mockResolvedValueOnce({
          content: [{ type: "text", text: "It is sunny." }],
          model: "claude-opus-4-8",
          stop_reason: "end_turn",
          usage: { input_tokens: 20, output_tokens: 6 },
        })
      const sdk = { messages: { create } } as unknown as Anthropic
      const client = new AnthropicClient(() => sdk)

      const ran: { name: string; input: unknown }[] = []
      const result = await client.complete({
        apiKey: "k",
        model: "claude-opus-4-8",
        prompt: "what is the weather",
        tools: [{ name: "lookup", description: "d", inputSchema: { type: "object" } }],
        runTool: async (name, input) => {
          ran.push({ name, input })
          return { temp: 25 }
        },
      })

      expect(result.text).toBe("It is sunny.")
      // usage is summed across both turns
      expect(result.usage).toEqual({ inputTokens: 30, outputTokens: 10 })
      expect(ran).toEqual([{ name: "lookup", input: { q: "weather" } }])

      // First call sends tools; second call replays assistant tool_use + tool_result.
      const firstBody = create.mock.calls[0][0]
      expect(firstBody.tools).toEqual([
        { name: "lookup", description: "d", input_schema: { type: "object" } },
      ])
      const secondBody = create.mock.calls[1][0]
      expect(secondBody.messages).toHaveLength(3)
      expect(secondBody.messages[2]).toEqual({
        role: "user",
        content: [
          {
            type: "tool_result",
            tool_use_id: "tu_1",
            content: JSON.stringify({ temp: 25 }),
            is_error: false,
          },
        ],
      })
    })

    it("reports tool errors back to the model as tool_result is_error", async () => {
      const create = vi
        .fn()
        .mockResolvedValueOnce({
          content: [{ type: "tool_use", id: "tu_1", name: "boom", input: {} }],
          model: "claude-opus-4-8",
          stop_reason: "tool_use",
          usage: { input_tokens: 1, output_tokens: 1 },
        })
        .mockResolvedValueOnce({
          content: [{ type: "text", text: "handled" }],
          model: "claude-opus-4-8",
          stop_reason: "end_turn",
          usage: { input_tokens: 1, output_tokens: 1 },
        })
      const sdk = { messages: { create } } as unknown as Anthropic
      const client = new AnthropicClient(() => sdk)
      await client.complete({
        apiKey: "k",
        model: "claude-opus-4-8",
        prompt: "go",
        tools: [{ name: "boom", description: "d", inputSchema: { type: "object" } }],
        runTool: async () => {
          throw new Error("kaboom")
        },
      })
      const result = create.mock.calls[1][0].messages[2].content[0]
      expect(result).toMatchObject({ is_error: true, content: "kaboom" })
    })

    it("stops at maxToolTurns when the model keeps calling tools", async () => {
      const create = vi.fn().mockResolvedValue({
        content: [{ type: "tool_use", id: "tu", name: "loop", input: {} }],
        model: "claude-opus-4-8",
        stop_reason: "tool_use",
        usage: { input_tokens: 1, output_tokens: 1 },
      })
      const sdk = { messages: { create } } as unknown as Anthropic
      const client = new AnthropicClient(() => sdk)
      const result = await client.complete({
        apiKey: "k",
        model: "claude-opus-4-8",
        prompt: "go",
        tools: [{ name: "loop", description: "d", inputSchema: { type: "object" } }],
        runTool: async () => ({}),
        maxToolTurns: 2,
      })
      expect(create).toHaveBeenCalledTimes(2)
      expect(result.text).toBe("")
    })
  })
})

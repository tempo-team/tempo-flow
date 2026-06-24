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
})

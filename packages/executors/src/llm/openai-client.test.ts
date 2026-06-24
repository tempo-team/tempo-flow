// Copyright 2026 The tempo-flow Authors
// SPDX-License-Identifier: Apache-2.0

import type OpenAI from "openai"
import { describe, expect, it, vi } from "vitest"
import { OpenAiClient } from "./openai-client.js"

function fakeSdk(content: string | null, usage = { prompt_tokens: 9, completion_tokens: 4 }) {
  const create = vi.fn().mockResolvedValue({
    choices: [{ message: { content } }],
    model: "gpt-5",
    usage,
  })
  const sdk = { chat: { completions: { create } } } as unknown as OpenAI
  return { sdk, create }
}

describe("OpenAiClient", () => {
  it("maps choices + usage into an LlmResult and sends system+user messages", async () => {
    const { sdk, create } = fakeSdk("Hi there")
    const client = new OpenAiClient(() => sdk)
    const result = await client.complete({
      apiKey: "k",
      model: "gpt-5",
      prompt: "hello",
      system: "be terse",
      maxTokens: 500,
    })
    expect(result.text).toBe("Hi there")
    expect(result.usage).toEqual({ inputTokens: 9, outputTokens: 4 })
    const body = create.mock.calls[0][0]
    expect(body.messages).toEqual([
      { role: "system", content: "be terse" },
      { role: "user", content: "hello" },
    ])
    expect(body.max_completion_tokens).toBe(500)
  })

  it("forces json_schema response format + maps effort to reasoning_effort", async () => {
    const { sdk, create } = fakeSdk('{"ok":true}')
    const client = new OpenAiClient(() => sdk)
    const schema = { type: "object", properties: { ok: { type: "boolean" } } }
    const result = await client.complete({
      apiKey: "k",
      model: "gpt-5",
      prompt: "x",
      effort: "high",
      outputSchema: schema,
    })
    expect(result.structured).toEqual({ ok: true })
    const body = create.mock.calls[0][0]
    expect(body.reasoning_effort).toBe("high")
    expect(body.response_format).toEqual({
      type: "json_schema",
      json_schema: { name: "output", schema, strict: true },
    })
  })

  it("falls back to the configured default model and caches per key", async () => {
    const factory = vi.fn(() => fakeSdk("ok").sdk)
    const client = new OpenAiClient(factory, "gpt-5-codex")
    expect(client.defaultModel).toBe("gpt-5-codex")
    await client.complete({ apiKey: "k1", model: "m", prompt: "a" })
    await client.complete({ apiKey: "k1", model: "m", prompt: "b" })
    expect(factory).toHaveBeenCalledTimes(1)
  })
})

// Copyright 2026 The tempo-flow Authors
// SPDX-License-Identifier: Apache-2.0

import type { GoogleGenAI } from "@google/genai"
import { describe, expect, it, vi } from "vitest"
import { GeminiClient } from "./gemini-client.js"

function fakeSdk(text: string, usageMetadata = { promptTokenCount: 8, candidatesTokenCount: 3 }) {
  const generateContent = vi.fn().mockResolvedValue({ text, usageMetadata })
  const sdk = { models: { generateContent } } as unknown as GoogleGenAI
  return { sdk, generateContent }
}

describe("GeminiClient", () => {
  it("maps text + usageMetadata and passes systemInstruction + maxOutputTokens", async () => {
    const { sdk, generateContent } = fakeSdk("a summary")
    const client = new GeminiClient(() => sdk)
    const result = await client.complete({
      apiKey: "k",
      model: "gemini-2.5-pro",
      prompt: "summarize",
      system: "be terse",
      maxTokens: 256,
    })
    expect(result.text).toBe("a summary")
    expect(result.usage).toEqual({ inputTokens: 8, outputTokens: 3 })
    const arg = generateContent.mock.calls[0][0]
    expect(arg.model).toBe("gemini-2.5-pro")
    expect(arg.contents).toBe("summarize")
    expect(arg.config.systemInstruction).toBe("be terse")
    expect(arg.config.maxOutputTokens).toBe(256)
  })

  it("requests JSON output with a responseSchema when outputSchema is set", async () => {
    const { sdk, generateContent } = fakeSdk('{"label":"x"}')
    const client = new GeminiClient(() => sdk)
    const schema = { type: "object", properties: { label: { type: "string" } } }
    const result = await client.complete({
      apiKey: "k",
      model: "gemini-2.5-pro",
      prompt: "classify",
      outputSchema: schema,
    })
    expect(result.structured).toEqual({ label: "x" })
    const cfg = generateContent.mock.calls[0][0].config
    expect(cfg.responseMimeType).toBe("application/json")
    expect(cfg.responseSchema).toEqual(schema)
  })

  it("uses the configured default model and caches per key", async () => {
    const factory = vi.fn(() => fakeSdk("ok").sdk)
    const client = new GeminiClient(factory, "gemini-2.5-flash")
    expect(client.defaultModel).toBe("gemini-2.5-flash")
    await client.complete({ apiKey: "k1", model: "m", prompt: "a" })
    await client.complete({ apiKey: "k1", model: "m", prompt: "b" })
    expect(factory).toHaveBeenCalledTimes(1)
  })
})

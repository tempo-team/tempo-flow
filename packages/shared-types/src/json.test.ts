// Copyright 2026 The tempo-flow Authors
// SPDX-License-Identifier: Apache-2.0

import { describe, expect, it } from "vitest"
import { fromJson, fromJsonOpt, toJson } from "./json.js"

describe("json helpers", () => {
  it("round-trips an object", () => {
    const value = { nodes: [{ id: "a" }], edges: [] }
    expect(fromJson(toJson(value), null)).toEqual(value)
  })

  it("fromJson returns fallback for null/undefined", () => {
    expect(fromJson(null, "fallback")).toBe("fallback")
    expect(fromJson(undefined, 42)).toBe(42)
  })

  it("fromJsonOpt returns undefined for null/undefined", () => {
    expect(fromJsonOpt(null)).toBeUndefined()
    expect(fromJsonOpt<string>('"x"')).toBe("x")
  })
})

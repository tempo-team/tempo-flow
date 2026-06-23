// Copyright 2026 The tempo-flow Authors
// SPDX-License-Identifier: Apache-2.0

import { describe, expect, it } from "vitest"
import { maskValues } from "./mask"

describe("maskValues", () => {
  it("masks a secret inside nested string values", () => {
    const out = maskValues({ headers: { authorization: "Bearer s3cr3t" }, note: "ok" }, ["s3cr3t"])
    expect(out).toEqual({ headers: { authorization: "Bearer ***" }, note: "ok" })
  })

  it("masks inside arrays and leaves non-strings intact", () => {
    expect(maskValues(["use s3cr3t", 42, true], ["s3cr3t"])).toEqual(["use ***", 42, true])
  })

  it("does NOT corrupt JSON literals when a secret value looks like one", () => {
    // secret value is the string "true"; a real boolean `true` must be untouched.
    const out = maskValues({ enabled: true, flag: "true" }, ["true"])
    expect(out).toEqual({ enabled: true, flag: "***" })
  })

  it("masks a numeric-looking secret only inside strings", () => {
    const out = maskValues({ count: 100, code: "code-100" }, ["100"])
    expect(out).toEqual({ count: 100, code: "code-***" })
  })

  it("returns the value unchanged when there are no sensitive values", () => {
    const v = { a: 1 }
    expect(maskValues(v, [undefined, ""])).toBe(v)
  })
})

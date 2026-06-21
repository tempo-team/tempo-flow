// Copyright 2026 The tempo-flow Authors
// SPDX-License-Identifier: Apache-2.0

import { describe, expect, it } from "vitest"
import { decryptSecret, encryptSecret } from "./crypto"

describe("crypto", () => {
  const key = "super-secret-key"

  it("round-trips a secret", () => {
    const enc = encryptSecret("https://hooks.slack.com/xyz", key)
    expect(enc).not.toContain("slack.com")
    expect(decryptSecret(enc, key)).toBe("https://hooks.slack.com/xyz")
  })

  it("produces different ciphertext each time (random IV)", () => {
    expect(encryptSecret("same", key)).not.toBe(encryptSecret("same", key))
  })

  it("fails to decrypt with the wrong key", () => {
    const enc = encryptSecret("secret", key)
    expect(() => decryptSecret(enc, "wrong-key")).toThrow()
  })
})

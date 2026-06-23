// Copyright 2026 The tempo-flow Authors
// SPDX-License-Identifier: Apache-2.0

import { createCipheriv, createDecipheriv, createHash, randomBytes } from "node:crypto"

const ALGO = "aes-256-gcm"

/** Hex-encoded SHA-256 of a value (e.g. for storing token lookups, never the raw token). */
export function sha256Hex(value: string): string {
  return createHash("sha256").update(value).digest("hex")
}

/** Derive a 32-byte key from the configured secret (any length). */
function deriveKey(secret: string): Buffer {
  return createHash("sha256").update(secret).digest()
}

/**
 * Encrypt a UTF-8 string with AES-256-GCM. Output: base64 of iv:tag:ciphertext.
 * Used to store notification secrets (webhook URLs, bot tokens) at rest.
 */
export function encryptSecret(plaintext: string, secret: string): string {
  const key = deriveKey(secret)
  const iv = randomBytes(12)
  const cipher = createCipheriv(ALGO, key, iv)
  const ciphertext = Buffer.concat([cipher.update(plaintext, "utf8"), cipher.final()])
  const tag = cipher.getAuthTag()
  return Buffer.concat([iv, tag, ciphertext]).toString("base64")
}

/** Decrypt a value produced by encryptSecret. */
export function decryptSecret(encoded: string, secret: string): string {
  const key = deriveKey(secret)
  const raw = Buffer.from(encoded, "base64")
  const iv = raw.subarray(0, 12)
  const tag = raw.subarray(12, 28)
  const ciphertext = raw.subarray(28)
  const decipher = createDecipheriv(ALGO, key, iv)
  decipher.setAuthTag(tag)
  return Buffer.concat([decipher.update(ciphertext), decipher.final()]).toString("utf8")
}

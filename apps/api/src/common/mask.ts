// Copyright 2026 The tempo-flow Authors
// SPDX-License-Identifier: Apache-2.0

/**
 * Replace every sensitive value occurring in a recorded artifact with `***`, so
 * secrets and one-time callback tokens are never persisted in plaintext (e.g. an
 * HTTP header/body/query that interpolated a `secrets.*` expression, or the
 * callback token handed to a job).
 *
 * Recurses the structure and substitutes only inside *string* values — never
 * touching JSON literals (a secret whose value is `"true"` or a number must not
 * mangle a real `true`/number elsewhere in the payload).
 */
export function maskValues<T>(value: T, sensitive: Array<string | undefined>): T {
  const values = sensitive.filter((v): v is string => typeof v === "string" && v.length > 0)
  if (values.length === 0) return value
  return walk(value, values) as T
}

function walk(value: unknown, values: string[]): unknown {
  if (typeof value === "string") {
    let s = value
    for (const v of values) if (s.includes(v)) s = s.split(v).join("***")
    return s
  }
  if (Array.isArray(value)) return value.map((v) => walk(v, values))
  if (value !== null && typeof value === "object") {
    const out: Record<string, unknown> = {}
    for (const [k, v] of Object.entries(value)) out[k] = walk(v, values)
    return out
  }
  return value
}

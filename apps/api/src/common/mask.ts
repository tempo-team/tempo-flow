// Copyright 2026 The tempo-flow Authors
// SPDX-License-Identifier: Apache-2.0

/**
 * Replace every sensitive value occurring in a recorded artifact with `***`, so
 * secrets and one-time callback tokens are never persisted in plaintext (e.g. an
 * HTTP header/body/query that interpolated a `secrets.*` expression, or the
 * callback token handed to a job). Operates on the serialized form so nested
 * values are caught too.
 */
export function maskValues(value: unknown, sensitive: Array<string | undefined>): unknown {
  if (value === undefined) return value
  const values = sensitive.filter((v): v is string => typeof v === "string" && v.length > 0)
  if (values.length === 0) return value
  let json = JSON.stringify(value)
  for (const v of values) {
    // Match the value as it appears inside JSON (escaped, without the quotes).
    json = json.split(JSON.stringify(v).slice(1, -1)).join("***")
  }
  return JSON.parse(json)
}

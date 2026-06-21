// Copyright 2026 The tempo-flow Authors
// SPDX-License-Identifier: Apache-2.0

/**
 * JSON (de)serialization helpers.
 *
 * To keep the Prisma schema portable across PostgreSQL, MySQL, and SQLite, all
 * JSON-shaped columns are stored as `String`. These helpers centralize the
 * encode/decode so callers never hand-roll `JSON.parse`/`JSON.stringify`.
 */

/** Serialize a value to a JSON string for storage. */
export function toJson(value: unknown): string {
  return JSON.stringify(value)
}

/** Parse a stored JSON string. Returns `fallback` for null/undefined input. */
export function fromJson<T>(value: string | null | undefined, fallback: T): T {
  if (value === null || value === undefined) return fallback
  return JSON.parse(value) as T
}

/** Parse a stored JSON string or return undefined when absent. */
export function fromJsonOpt<T>(value: string | null | undefined): T | undefined {
  if (value === null || value === undefined) return undefined
  return JSON.parse(value) as T
}

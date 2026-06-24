// Copyright 2026 The tempo-flow Authors
// SPDX-License-Identifier: Apache-2.0
//
// Test-side accessor for the fixture server's recorded calls (cross-process via
// its /__calls and /__reset introspection endpoints).

import { FIXTURE_URL } from "./config"

export interface RecordedCall {
  path: string
  method: string
  query: Record<string, string>
  headers: Record<string, string>
  body: unknown
  at: number
}

/** URL of a fixture endpoint, e.g. fixtureUrl("/echo"). */
export function fixtureUrl(path: string): string {
  return `${FIXTURE_URL}${path}`
}

export async function fixtureCalls(pathPrefix?: string): Promise<RecordedCall[]> {
  const url = pathPrefix
    ? `${FIXTURE_URL}/__calls?path=${encodeURIComponent(pathPrefix)}`
    : `${FIXTURE_URL}/__calls`
  const res = await fetch(url)
  return (await res.json()) as RecordedCall[]
}

export async function resetFixture(): Promise<void> {
  await fetch(`${FIXTURE_URL}/__reset`, { method: "POST" })
}

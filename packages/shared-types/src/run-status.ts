// Copyright 2026 The tempo-flow Authors
// SPDX-License-Identifier: Apache-2.0

/**
 * Run status values. Stored as plain strings (SQLite has no native enum), so
 * this object is the single source of truth shared by API and web.
 */
export const RunStatus = {
  PendingApproval: "PENDING_APPROVAL",
  Pending: "PENDING",
  Running: "RUNNING",
  Success: "SUCCESS",
  Failed: "FAILED",
  Canceled: "CANCELED",
} as const

export type RunStatus = (typeof RunStatus)[keyof typeof RunStatus]

export const TERMINAL_STATUSES: readonly RunStatus[] = [
  RunStatus.Success,
  RunStatus.Failed,
  RunStatus.Canceled,
]

export function isTerminal(status: RunStatus): boolean {
  return TERMINAL_STATUSES.includes(status)
}

// Copyright 2026 The tempo-flow Authors
// SPDX-License-Identifier: Apache-2.0

/**
 * Single source of truth mapping run/node statuses to the semantic palette
 * (defined in index.css). Shared by status badges, DAG nodes, and edges so every
 * surface reads from the same colors.
 */
export type StatusTone = "success" | "running" | "warning" | "failed" | "info" | "muted"

const TONE: Record<string, StatusTone> = {
  SUCCESS: "success",
  RUNNING: "running",
  WAITING_CALLBACK: "running",
  PENDING: "warning",
  PENDING_APPROVAL: "info",
  FAILED: "failed",
  CANCELED: "muted",
}

export function statusTone(status: string): StatusTone {
  return TONE[status] ?? "muted"
}

// Literal class strings (Tailwind can only see static class names — no templating).
const BADGE_CLASS: Record<StatusTone, string> = {
  success: "bg-success-subtle text-success",
  running: "bg-running-subtle text-running",
  warning: "bg-warning-subtle text-warning",
  failed: "bg-failed-subtle text-failed",
  info: "bg-info-subtle text-info",
  muted: "bg-muted text-muted-foreground",
}

export function statusBadgeClass(status: string): string {
  return BADGE_CLASS[statusTone(status)]
}

/** CSS color for a node's status stripe (inline style). Neutral when no run. */
export function statusVar(status?: string): string {
  if (!status) return "var(--border)"
  const tone = statusTone(status)
  return tone === "muted" ? "var(--border)" : `var(--${tone})`
}

/** True for statuses that should pulse (work in flight). */
export function isActiveStatus(status?: string): boolean {
  return status === "RUNNING" || status === "WAITING_CALLBACK"
}

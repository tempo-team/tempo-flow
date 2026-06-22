// Copyright 2026 The tempo-flow Authors
// SPDX-License-Identifier: Apache-2.0

/**
 * RBAC actions and resources. Permissions are expressed as `action:resource`,
 * e.g. `execute:flow`, `edit:flow`, `view:history`, `manage:user`.
 *
 * Shared between the API (NestJS + CASL) and the web client so that both sides
 * reason about the exact same permission set. Fleshed out in Phase 2.
 */

export const Action = {
  Manage: "manage",
  View: "view",
  Edit: "edit",
  Execute: "execute",
  Approve: "approve",
} as const

export type Action = (typeof Action)[keyof typeof Action]

export const Resource = {
  Flow: "flow",
  Run: "run",
  History: "history",
  User: "user",
  Setting: "setting",
} as const

export type Resource = (typeof Resource)[keyof typeof Resource]

export type Permission = `${Action}:${Resource}`

export function permission(action: Action, resource: Resource): Permission {
  return `${action}:${resource}`
}

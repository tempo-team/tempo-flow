// Copyright 2026 The tempo-flow Authors
// SPDX-License-Identifier: Apache-2.0

import { SetMetadata } from "@nestjs/common"
import type { Action, Resource } from "@tempo-flow/shared-types"

export const PERMISSION_KEY = "required_permission"

export interface RequiredPermission {
  action: Action
  resource: Resource
}

/**
 * Require an `action:resource` permission on a route. Combine with
 * PermissionsGuard (which also enforces authentication).
 */
export const RequirePermission = (action: Action, resource: Resource) =>
  SetMetadata<string, RequiredPermission>(PERMISSION_KEY, { action, resource })

// Copyright 2026 The tempo-flow Authors
// SPDX-License-Identifier: Apache-2.0

import {
  type CanActivate,
  type ExecutionContext,
  ForbiddenException,
  Injectable,
} from "@nestjs/common"
import { Reflector } from "@nestjs/core"
import type { AuthPrincipal } from "@tempo-flow/shared-types"
import { AbilityFactory } from "./ability.factory"
import { PERMISSION_KEY, type RequiredPermission } from "./require-permission.decorator"

/**
 * Enforces the `@RequirePermission(action, resource)` metadata. Assumes the
 * request is already authenticated (JwtAuthGuard runs first), so req.user is a
 * populated AuthPrincipal.
 */
@Injectable()
export class PermissionsGuard implements CanActivate {
  constructor(
    private readonly reflector: Reflector,
    private readonly abilityFactory: AbilityFactory,
  ) {}

  canActivate(context: ExecutionContext): boolean {
    const required = this.reflector.getAllAndOverride<RequiredPermission | undefined>(
      PERMISSION_KEY,
      [context.getHandler(), context.getClass()],
    )
    if (!required) return true

    const request = context.switchToHttp().getRequest<{ user?: AuthPrincipal }>()
    const user = request.user
    if (!user) throw new ForbiddenException("Not authenticated")

    const ability = this.abilityFactory.createForPrincipal(user)
    if (!ability.can(required.action, required.resource)) {
      throw new ForbiddenException(`Missing permission ${required.action}:${required.resource}`)
    }
    return true
  }
}

// Copyright 2026 The tempo-flow Authors
// SPDX-License-Identifier: Apache-2.0

import { type ExecutionContext, createParamDecorator } from "@nestjs/common"
import type { AuthPrincipal } from "@tempo-flow/shared-types"

/** Inject the authenticated principal (req.user) into a handler argument. */
export const CurrentUser = createParamDecorator(
  (_data: unknown, ctx: ExecutionContext): AuthPrincipal => {
    const request = ctx.switchToHttp().getRequest<{ user: AuthPrincipal }>()
    return request.user
  },
)

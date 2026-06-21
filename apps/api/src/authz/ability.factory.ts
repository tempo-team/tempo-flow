// Copyright 2026 The tempo-flow Authors
// SPDX-License-Identifier: Apache-2.0

import { Injectable } from "@nestjs/common"
import { AbilityBuilder, type MongoAbility, createMongoAbility } from "@casl/ability"
import type { AuthPrincipal } from "@tempo-flow/shared-types"

/** CASL ability over (action, resource) string tuples. */
export type AppAbility = MongoAbility<[string, string]>

@Injectable()
export class AbilityFactory {
  /**
   * Build a CASL ability from a principal's flattened `action:resource`
   * permissions. The `manage` action is CASL's wildcard, so `manage:flow`
   * implicitly grants edit/view/execute on `flow`.
   */
  createForPrincipal(principal: AuthPrincipal): AppAbility {
    const { can, build } = new AbilityBuilder<AppAbility>(createMongoAbility)
    for (const perm of principal.permissions) {
      const [action, resource] = perm.split(":")
      if (action && resource) can(action, resource)
    }
    return build()
  }
}

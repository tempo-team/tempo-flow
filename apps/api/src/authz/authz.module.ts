// Copyright 2026 The tempo-flow Authors
// SPDX-License-Identifier: Apache-2.0

import { Global, Module } from "@nestjs/common"
import { AbilityFactory } from "./ability.factory"
import { PermissionsGuard } from "./permissions.guard"

@Global()
@Module({
  providers: [AbilityFactory, PermissionsGuard],
  exports: [AbilityFactory, PermissionsGuard],
})
export class AuthzModule {}

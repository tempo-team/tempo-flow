// Copyright 2026 The tempo-flow Authors
// SPDX-License-Identifier: Apache-2.0

import { IsIn, IsOptional, IsString, MinLength } from "class-validator"

/** Create or rotate a secret. The value is write-only (never returned). */
export class UpsertSecretRequest {
  @IsString()
  @MinLength(1)
  key!: string

  @IsString()
  @MinLength(1)
  value!: string

  @IsOptional()
  @IsIn(["global", "flow"])
  scope?: "global" | "flow"

  /** Required when scope is "flow". */
  @IsOptional()
  @IsString()
  flowId?: string
}

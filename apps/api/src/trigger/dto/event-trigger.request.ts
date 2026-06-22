// Copyright 2026 The tempo-flow Authors
// SPDX-License-Identifier: Apache-2.0

import { IsObject, IsOptional, IsString, MaxLength } from "class-validator"

export class CreateEventTriggerRequest {
  @IsOptional()
  @IsString()
  source?: string

  @IsString()
  @MaxLength(200)
  topic!: string

  /** Optional exact-match filter on message fields (JSONata in Phase 12). */
  @IsOptional()
  @IsObject()
  filter?: Record<string, string>
}

// Copyright 2026 The tempo-flow Authors
// SPDX-License-Identifier: Apache-2.0

import { IsBoolean, IsOptional, IsString, MaxLength } from "class-validator"

export class CreateWebhookRequest {
  @IsOptional()
  @IsString()
  @MaxLength(80)
  label?: string

  /** Generate an HMAC signing secret for this webhook. */
  @IsOptional()
  @IsBoolean()
  withSecret?: boolean
}

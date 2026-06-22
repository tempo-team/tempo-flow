// Copyright 2026 The tempo-flow Authors
// SPDX-License-Identifier: Apache-2.0

import { IsInt, IsObject, IsOptional, IsString, Min } from "class-validator"

export class ManualRunRequest {
  /** ISO date for backfill/reprocessing; defaults to now when omitted. */
  @IsOptional()
  @IsString()
  runDate?: string

  /** Param overrides merged on top of each node's resolved params. */
  @IsOptional()
  @IsObject()
  params?: Record<string, string>
}

export class ApprovalDecisionRequest {
  @IsOptional()
  @IsString()
  note?: string
}

export class BackfillRequest {
  @IsString()
  from!: string

  @IsString()
  to!: string

  /** Hours between generated runs (default 24). */
  @IsOptional()
  @IsInt()
  @Min(1)
  stepHours?: number
}

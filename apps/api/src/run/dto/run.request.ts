// Copyright 2026 The tempo-flow Authors
// SPDX-License-Identifier: Apache-2.0

import { IsObject, IsOptional, IsString } from "class-validator"

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

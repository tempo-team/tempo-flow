// Copyright 2026 The tempo-flow Authors
// SPDX-License-Identifier: Apache-2.0

import { IsIn, IsObject, IsOptional, IsString } from "class-validator"

/** Body an external job POSTs to report its final result. */
export class CallbackReportRequest {
  @IsIn(["success", "failure"])
  status!: "success" | "failure"

  /** Arbitrary result payload, surfaced to downstream params as nodes.<id>.output. */
  @IsOptional()
  @IsObject()
  output?: Record<string, unknown>

  @IsOptional()
  @IsString()
  errorMessage?: string
}

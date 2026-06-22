// Copyright 2026 The tempo-flow Authors
// SPDX-License-Identifier: Apache-2.0

import type { FlowDefinition, FlowTrigger, OverlapPolicy } from "@tempo-flow/shared-types"
import {
  IsBoolean,
  IsIn,
  IsInt,
  IsObject,
  IsOptional,
  IsString,
  Min,
  MinLength,
} from "class-validator"

export class CreateFlowRequest {
  @IsString()
  @MinLength(1)
  name!: string

  @IsOptional()
  @IsString()
  description?: string

  // Deep DAG validation is performed by flow-engine in the service.
  @IsObject()
  definition!: FlowDefinition

  @IsObject()
  trigger!: FlowTrigger

  @IsOptional()
  @IsBoolean()
  enabled?: boolean

  @IsOptional()
  @IsIn(["skip", "allow"])
  overlapPolicy?: OverlapPolicy

  /** Deadline (ms) from run start; exceeding it fails the run + alerts. */
  @IsOptional()
  @IsInt()
  @Min(0)
  slaMs?: number

  @IsOptional()
  @IsBoolean()
  requiresApproval?: boolean
}

export class ImportFlowRequest {
  @IsString()
  @MinLength(1)
  yaml!: string
}

export class UpdateFlowRequest {
  @IsOptional()
  @IsString()
  @MinLength(1)
  name?: string

  @IsOptional()
  @IsString()
  description?: string

  @IsOptional()
  @IsObject()
  definition?: FlowDefinition

  @IsOptional()
  @IsObject()
  trigger?: FlowTrigger

  @IsOptional()
  @IsBoolean()
  enabled?: boolean

  @IsOptional()
  @IsIn(["skip", "allow"])
  overlapPolicy?: OverlapPolicy

  @IsOptional()
  @IsInt()
  @Min(0)
  slaMs?: number

  @IsOptional()
  @IsBoolean()
  requiresApproval?: boolean
}

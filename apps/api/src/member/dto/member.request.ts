// Copyright 2026 The tempo-flow Authors
// SPDX-License-Identifier: Apache-2.0

import { IsArray, IsBoolean, IsEmail, IsOptional, IsString, MinLength } from "class-validator"

export class CreateUserRequest {
  @IsEmail()
  email!: string

  @IsString()
  @MinLength(6)
  password!: string

  @IsOptional()
  @IsString()
  name?: string

  @IsOptional()
  @IsArray()
  @IsString({ each: true })
  roles?: string[]
}

export class UpdateUserRequest {
  @IsOptional()
  @IsString()
  name?: string

  @IsOptional()
  @IsBoolean()
  active?: boolean

  @IsOptional()
  @IsString()
  @MinLength(6)
  password?: string
}

export class SetRolesRequest {
  @IsArray()
  @IsString({ each: true })
  roles!: string[]
}

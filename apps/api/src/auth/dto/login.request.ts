// Copyright 2026 The tempo-flow Authors
// SPDX-License-Identifier: Apache-2.0

import { IsEmail, IsString, MinLength } from "class-validator"

export class LoginRequest {
  @IsEmail()
  email!: string

  @IsString()
  @MinLength(6)
  password!: string
}

export class RefreshRequest {
  @IsString()
  refreshToken!: string
}

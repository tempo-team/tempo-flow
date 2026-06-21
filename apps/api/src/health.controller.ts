// Copyright 2026 The tempo-flow Authors
// SPDX-License-Identifier: Apache-2.0

import { Controller, Get } from "@nestjs/common"

@Controller("health")
export class HealthController {
  @Get()
  check(): { status: string; service: string } {
    return { status: "ok", service: "tempo-flow-api" }
  }
}

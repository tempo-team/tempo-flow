// Copyright 2026 The tempo-flow Authors
// SPDX-License-Identifier: Apache-2.0

import { Controller, Get, Header, Res } from "@nestjs/common"
import type { Response } from "express"
import { MetricsService } from "./metrics.service"

@Controller("metrics")
export class MetricsController {
  constructor(private readonly metrics: MetricsService) {}

  @Get()
  @Header("content-type", "text/plain; version=0.0.4; charset=utf-8")
  async scrape(@Res({ passthrough: true }) res: Response): Promise<string> {
    res.setHeader("content-type", this.metrics.contentType)
    return this.metrics.scrape()
  }
}

// Copyright 2026 The tempo-flow Authors
// SPDX-License-Identifier: Apache-2.0

import { Module } from "@nestjs/common"
import { QueueService } from "./queue.service"

@Module({
  providers: [QueueService],
  exports: [QueueService],
})
export class QueueModule {}

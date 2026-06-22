// Copyright 2026 The tempo-flow Authors
// SPDX-License-Identifier: Apache-2.0

import { Global, Module } from "@nestjs/common"
import { RunEventsService } from "./run-events.service"

/** Global so any service can publish/subscribe run events without re-importing. */
@Global()
@Module({
  providers: [RunEventsService],
  exports: [RunEventsService],
})
export class RunEventsModule {}

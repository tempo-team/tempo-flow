// Copyright 2026 The tempo-flow Authors
// SPDX-License-Identifier: Apache-2.0

import { Controller, type MessageEvent, Param, Sse, UseGuards } from "@nestjs/common"
import type { RunEvent } from "@tempo-flow/shared-types"
import { Observable } from "rxjs"
import { RunEventsService } from "../events/run-events.service"
import { SseAuthGuard } from "./sse-auth.guard"

/**
 * Server-Sent Events for live run/node status. Path is under /api/stream/... to
 * avoid colliding with /api/runs/:id. The browser connects with
 * `new EventSource("/api/stream/runs/<id>?token=<accessToken>")`.
 */
@Controller("stream")
@UseGuards(SseAuthGuard)
export class RunStreamController {
  constructor(private readonly runEvents: RunEventsService) {}

  @Sse("runs/:id")
  streamRun(@Param("id") id: string): Observable<MessageEvent> {
    return this.toStream(id)
  }

  /** Global stream of all run events (dashboard / flow run lists). */
  @Sse("runs")
  streamAll(): Observable<MessageEvent> {
    return this.toStream("*")
  }

  private toStream(key: string): Observable<MessageEvent> {
    return new Observable<MessageEvent>((subscriber) => {
      const off = this.runEvents.subscribe(key, (event: RunEvent) => {
        subscriber.next({ data: event })
      })
      return () => off()
    })
  }
}

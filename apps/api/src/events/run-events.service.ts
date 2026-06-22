// Copyright 2026 The tempo-flow Authors
// SPDX-License-Identifier: Apache-2.0

import { Inject, Injectable, Logger, type OnModuleDestroy } from "@nestjs/common"
import type { RunEvent } from "@tempo-flow/shared-types"
import type { Redis } from "ioredis"
import { REDIS_CLIENT } from "../redis/redis.constants"

const CHANNEL_PREFIX = "tf:run:"
const CHANNEL_PATTERN = "tf:run:*"

export type RunEventListener = (event: RunEvent) => void

/**
 * Real-time run event bus over Redis pub/sub. Workers `publish()` run/node
 * events; any API instance `subscribe()`s and relays them (e.g. to SSE). A
 * single duplicated connection psubscribes to all run channels and fans out to
 * in-process listeners, so distributed workers and multiple API instances stay
 * in sync.
 */
@Injectable()
export class RunEventsService implements OnModuleDestroy {
  private readonly logger = new Logger(RunEventsService.name)
  private subscriber?: Redis
  private subscribing?: Promise<void>
  private readonly byRun = new Map<string, Set<RunEventListener>>()
  private readonly global = new Set<RunEventListener>()

  constructor(@Inject(REDIS_CLIENT) private readonly publisher: Redis) {}

  async publish(event: RunEvent): Promise<void> {
    try {
      await this.publisher.publish(CHANNEL_PREFIX + event.flowRunId, JSON.stringify(event))
    } catch (err) {
      this.logger.warn(`Failed to publish run event: ${(err as Error).message}`)
    }
  }

  /**
   * Subscribe to events for one run, or all runs when `flowRunId === "*"`.
   * Returns an unsubscribe function.
   */
  subscribe(flowRunId: string, listener: RunEventListener): () => void {
    void this.ensureSubscriber()
    const set = this.bucket(flowRunId)
    set.add(listener)
    return () => {
      set.delete(listener)
      if (flowRunId !== "*" && set.size === 0) this.byRun.delete(flowRunId)
    }
  }

  private bucket(flowRunId: string): Set<RunEventListener> {
    if (flowRunId === "*") return this.global
    let set = this.byRun.get(flowRunId)
    if (!set) {
      set = new Set()
      this.byRun.set(flowRunId, set)
    }
    return set
  }

  private ensureSubscriber(): Promise<void> {
    if (this.subscribing) return this.subscribing
    this.subscriber = this.publisher.duplicate()
    this.subscriber.on("pmessage", (_pattern, _channel, payload) => this.dispatch(payload))
    this.subscribing = this.subscriber
      .psubscribe(CHANNEL_PATTERN)
      .then(() => undefined)
      .catch((err: Error) => {
        this.logger.error(`Failed to psubscribe: ${err.message}`)
        this.subscribing = undefined
      })
    return this.subscribing
  }

  private dispatch(payload: string): void {
    let event: RunEvent
    try {
      event = JSON.parse(payload) as RunEvent
    } catch {
      return
    }
    this.byRun.get(event.flowRunId)?.forEach((cb) => cb(event))
    this.global.forEach((cb) => cb(event))
  }

  async onModuleDestroy(): Promise<void> {
    await this.subscriber?.quit().catch(() => undefined)
  }
}

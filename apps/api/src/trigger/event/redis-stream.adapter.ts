// Copyright 2026 The tempo-flow Authors
// SPDX-License-Identifier: Apache-2.0

import { hostname } from "node:os"
import { Inject, Injectable, Logger } from "@nestjs/common"
import type { Redis } from "ioredis"
import { REDIS_CLIENT } from "../../redis/redis.constants"
import type { EventMessageHandler, EventTriggerAdapter } from "./event-adapter"

const GROUP = "tempo-flow"
const CONSUMER = `${hostname()}-${process.pid}`
const BLOCK_MS = 5000

/**
 * Consumes Redis Streams with a consumer group, so across multiple API/worker
 * instances each message is delivered to exactly one consumer (no duplicate
 * triggers). External systems publish with `XADD <topic> * key val ...`.
 */
@Injectable()
export class RedisStreamAdapter implements EventTriggerAdapter {
  readonly source = "redis"
  private readonly logger = new Logger(RedisStreamAdapter.name)
  private conn?: Redis
  private running = false
  private topics: string[] = []

  constructor(@Inject(REDIS_CLIENT) private readonly redis: Redis) {}

  async start(topics: string[], handler: EventMessageHandler): Promise<void> {
    await this.stop()
    this.topics = [...new Set(topics)]
    if (this.topics.length === 0) return

    // Dedicated blocking connection (XREADGROUP BLOCK ties up the socket).
    this.conn = this.redis.duplicate()
    for (const topic of this.topics) {
      // MKSTREAM creates the stream if absent; ignore BUSYGROUP (already exists).
      await this.conn.xgroup("CREATE", topic, GROUP, "$", "MKSTREAM").catch((err: Error) => {
        if (!err.message.includes("BUSYGROUP")) throw err
      })
    }
    this.running = true
    void this.loop(handler)
    this.logger.log(`Consuming ${this.topics.length} Redis stream topic(s)`)
  }

  private async loop(handler: EventMessageHandler): Promise<void> {
    const conn = this.conn
    if (!conn) return
    while (this.running) {
      try {
        const streams = (await conn.xreadgroup(
          "GROUP",
          GROUP,
          CONSUMER,
          "COUNT",
          10,
          "BLOCK",
          BLOCK_MS,
          "STREAMS",
          ...this.topics,
          ...this.topics.map(() => ">"),
        )) as [string, [string, string[]][]][] | null
        if (!streams) continue
        for (const [topic, entries] of streams) {
          for (const [id, flat] of entries) {
            handler({ topic, fields: toFields(flat) })
            await conn.xack(topic, GROUP, id).catch(() => undefined)
          }
        }
      } catch (err) {
        if (!this.running) break
        this.logger.warn(`Stream read failed: ${(err as Error).message}`)
        await new Promise((r) => setTimeout(r, 1000))
      }
    }
  }

  async stop(): Promise<void> {
    this.running = false
    if (this.conn) {
      await this.conn.quit().catch(() => undefined)
      this.conn = undefined
    }
  }
}

/** Redis returns stream fields as a flat [k1, v1, k2, v2, ...] array. */
function toFields(flat: string[]): Record<string, string> {
  const out: Record<string, string> = {}
  for (let i = 0; i + 1 < flat.length; i += 2) out[flat[i]] = flat[i + 1]
  return out
}

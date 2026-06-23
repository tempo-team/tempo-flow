// Copyright 2026 The tempo-flow Authors
// SPDX-License-Identifier: Apache-2.0

import { randomUUID } from "node:crypto"
import { Inject, Injectable, type OnModuleDestroy } from "@nestjs/common"
import { type ConnectionOptions, Queue } from "bullmq"
import type { Redis } from "ioredis"
import { FLOW_RUN_QUEUE, REDIS_CLIENT } from "../redis/redis.constants"

export interface FlowRunJobData {
  flowRunId: string
  flowId: string
  /** true → a resume tick (callback/SLA); the engine continues from the checkpoint. */
  resume?: boolean
}

/**
 * Producer for the `flow-run` BullMQ queue. The job id is the FlowRun id so
 * BullMQ deduplicates: the same run is never enqueued twice (distributed
 * dedup, complementing the scheduler's Redis tick lock).
 */
@Injectable()
export class QueueService implements OnModuleDestroy {
  private readonly queue: Queue

  constructor(@Inject(REDIS_CLIENT) connection: Redis) {
    this.queue = new Queue(FLOW_RUN_QUEUE, {
      connection: connection as unknown as ConnectionOptions,
    })
  }

  async enqueueFlowRun(data: FlowRunJobData): Promise<void> {
    await this.queue.add("run", data, {
      jobId: data.flowRunId,
      removeOnComplete: 1000,
      removeOnFail: 5000,
    })
  }

  /**
   * Enqueue a resume tick for a suspended run (after a callback or an SLA
   * deadline). Uses a fresh jobId so it is never deduped against the original
   * `run` job (whose id is the flowRunId); the engine's advance is idempotent,
   * so redundant resume ticks are harmless.
   */
  async enqueueResume(flowRunId: string, flowId: string): Promise<void> {
    await this.queue.add(
      "run",
      { flowRunId, flowId, resume: true },
      { jobId: `${flowRunId}:resume:${randomUUID()}`, removeOnComplete: true, removeOnFail: true },
    )
  }

  /** The underlying BullMQ queue (for metrics + the Bull-Board dashboard). */
  getQueue(): Queue {
    return this.queue
  }

  async onModuleDestroy(): Promise<void> {
    await this.queue.close().catch(() => undefined)
  }
}

// Copyright 2026 The tempo-flow Authors
// SPDX-License-Identifier: Apache-2.0

import { Inject, Injectable, Logger, type OnModuleDestroy, type OnModuleInit } from "@nestjs/common"
import { ConfigService } from "@nestjs/config"
import { type ConnectionOptions, Worker } from "bullmq"
import type { Redis } from "ioredis"
import { FLOW_RUN_QUEUE, REDIS_CLIENT } from "../redis/redis.constants"
import type { FlowRunJobData } from "../queue/queue.service"
import { RunService } from "./run.service"

/**
 * BullMQ worker that consumes `flow-run` jobs and executes them. Runs in-process
 * by default; set WORKER_ENABLED=false to run the API without a worker (e.g. a
 * dedicated worker deployment, or local boot without Redis).
 */
@Injectable()
export class FlowProcessor implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(FlowProcessor.name)
  private worker?: Worker<FlowRunJobData>

  constructor(
    @Inject(REDIS_CLIENT) private readonly connection: Redis,
    private readonly config: ConfigService,
    private readonly runService: RunService,
  ) {}

  onModuleInit(): void {
    if (this.config.get<string>("WORKER_ENABLED") === "false") {
      this.logger.log("Worker disabled (WORKER_ENABLED=false)")
      return
    }
    const concurrency = Number(this.config.get<string>("WORKER_CONCURRENCY") ?? 5)
    this.worker = new Worker<FlowRunJobData>(
      FLOW_RUN_QUEUE,
      async (job) => {
        await this.runService.executeRun(job.data.flowRunId, job.data.resume ?? false)
      },
      // Dedicated (duplicated) connection — workers issue blocking commands.
      { connection: this.connection.duplicate() as unknown as ConnectionOptions, concurrency },
    )
    this.worker.on("failed", (job, err) => {
      this.logger.error(`Job ${job?.id} failed: ${err.message}`)
    })
    this.logger.log(`Flow worker started (concurrency=${concurrency})`)
  }

  async onModuleDestroy(): Promise<void> {
    await this.worker?.close().catch(() => undefined)
  }
}

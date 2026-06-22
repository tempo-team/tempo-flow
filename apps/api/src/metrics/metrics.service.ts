// Copyright 2026 The tempo-flow Authors
// SPDX-License-Identifier: Apache-2.0

import { Injectable } from "@nestjs/common"
import { Gauge, Registry, collectDefaultMetrics } from "prom-client"
import { PrismaService } from "../prisma/prisma.service"
import { QueueService } from "../queue/queue.service"

/**
 * Prometheus metrics for runs and the BullMQ queue. Both gauges are refreshed
 * from shared state (Postgres + Redis) on each scrape, so they are accurate
 * regardless of which process (api or worker) executed the runs.
 */
@Injectable()
export class MetricsService {
  private readonly registry = new Registry()

  private readonly runsByStatus = new Gauge({
    name: "tempo_flow_runs",
    help: "Flow runs by status",
    labelNames: ["status"],
    registers: [this.registry],
  })
  private readonly queueDepth = new Gauge({
    name: "tempo_flow_queue_jobs",
    help: "BullMQ flow-run queue job counts by state",
    labelNames: ["state"],
    registers: [this.registry],
  })

  constructor(
    private readonly prisma: PrismaService,
    private readonly queue: QueueService,
  ) {
    collectDefaultMetrics({ register: this.registry })
  }

  /** Render the Prometheus exposition text, refreshing gauges from DB + Redis. */
  async scrape(): Promise<string> {
    try {
      const grouped = await this.prisma.flowRun.groupBy({ by: ["status"], _count: true })
      this.runsByStatus.reset()
      for (const g of grouped) this.runsByStatus.set({ status: g.status }, g._count)
    } catch {
      // leave stale gauges if the DB is briefly unavailable
    }
    try {
      const counts = await this.queue
        .getQueue()
        .getJobCounts("waiting", "active", "completed", "failed", "delayed")
      for (const [state, n] of Object.entries(counts)) this.queueDepth.set({ state }, n)
    } catch {
      // leave stale gauges if Redis is briefly unavailable
    }
    return this.registry.metrics()
  }

  get contentType(): string {
    return this.registry.contentType
  }
}

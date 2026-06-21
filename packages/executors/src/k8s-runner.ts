// Copyright 2026 The tempo-flow Authors
// SPDX-License-Identifier: Apache-2.0

import { BatchV1Api, CoreV1Api, KubeConfig, type V1Job } from "@kubernetes/client-node"
import type { K8sJobResult, K8sJobRunner } from "./k8s-executor.js"

/**
 * Real cluster runner backed by @kubernetes/client-node (v1.x). Loads in-cluster
 * config when running inside K8s, otherwise the local kubeconfig. Creates the
 * Job, polls to completion, and collects the pod's exit code + logs.
 *
 * This is cluster glue (validated via the minikube E2E in CI), not unit-tested.
 * The API client is treated loosely to stay resilient across client minor
 * versions whose method signatures differ (positional vs object params).
 */
export class DefaultK8sJobRunner implements K8sJobRunner {
  private batch?: BatchV1Api
  private core?: CoreV1Api

  constructor(
    private readonly pollIntervalMs = 2000,
    private readonly timeoutMs = 10 * 60 * 1000,
  ) {}

  private init(): { batch: BatchV1Api; core: CoreV1Api } {
    if (!this.batch || !this.core) {
      const kc = new KubeConfig()
      kc.loadFromDefault()
      this.batch = kc.makeApiClient(BatchV1Api)
      this.core = kc.makeApiClient(CoreV1Api)
    }
    return { batch: this.batch, core: this.core }
  }

  async run(manifest: V1Job, namespace: string): Promise<K8sJobResult> {
    const { batch, core } = this.init()
    const api = batch as unknown as Record<string, (...a: unknown[]) => Promise<unknown>>
    const coreApi = core as unknown as Record<string, (...a: unknown[]) => Promise<any>>

    const name = manifest.metadata?.name as string
    await api.createNamespacedJob({ namespace, body: manifest })

    const deadline = Date.now() + this.timeoutMs
    while (Date.now() < deadline) {
      await sleep(this.pollIntervalMs)
      const job = (await api.readNamespacedJob({ name, namespace })) as {
        status?: { succeeded?: number; failed?: number }
      }
      const succeeded = (job.status?.succeeded ?? 0) > 0
      const failed = (job.status?.failed ?? 0) > 0
      if (succeeded || failed) {
        const logs = await this.collectLogs(coreApi, namespace, name)
        return {
          succeeded,
          exitCode: succeeded ? 0 : 1,
          logs,
          message: failed ? "Job failed" : undefined,
        }
      }
    }
    return { succeeded: false, message: `Job ${name} timed out` }
  }

  private async collectLogs(
    core: Record<string, (...a: unknown[]) => Promise<any>>,
    namespace: string,
    jobName: string,
  ): Promise<string | undefined> {
    try {
      const pods = await core.listNamespacedPod({ namespace, labelSelector: `job-name=${jobName}` })
      const podName = pods?.items?.[0]?.metadata?.name
      if (!podName) return undefined
      return (await core.readNamespacedPodLog({ name: podName, namespace })) as string
    } catch {
      return undefined
    }
  }
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms))
}

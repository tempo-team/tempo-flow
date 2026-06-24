// Copyright 2026 The tempo-flow Authors
// SPDX-License-Identifier: Apache-2.0

import type { V1Job } from "@kubernetes/client-node"
import type { FlowNode, K8sExecutorConfig } from "@tempo-flow/shared-types"
import type { ExecResult, JobExecutor, RunContext } from "./executor.js"
import { resolveNodeParams } from "./params.js"

const DEFAULT_NAMESPACE = "default"

/** Result of running a Job to completion. */
export interface K8sJobResult {
  succeeded: boolean
  exitCode?: number
  logs?: string
  message?: string
}

/** Cluster-facing dependency — real impl uses @kubernetes/client-node; mocked in tests. */
export interface K8sJobRunner {
  run(manifest: V1Job, namespace: string): Promise<K8sJobResult>
}

/** Sanitize to a DNS-1123 label fragment (lowercase alnum + dashes, ≤40 chars). */
export function k8sName(...parts: string[]): string {
  const base = parts
    .join("-")
    .toLowerCase()
    .replace(/[^a-z0-9-]/g, "-")
    .replace(/-+/g, "-")
    .replace(/^-|-$/g, "")
    .slice(0, 40)
  return base || "job"
}

/** A single container spec for a one-shot Job (executor-neutral). */
export interface JobContainer {
  image: string
  command?: string[]
  args?: string[]
  env?: { name: string; value: string }[]
}

/**
 * Build a one-shot Kubernetes Job manifest from a container spec. Shared by the
 * k8s and spring-batch executors so the Job skeleton (backoffLimit 0,
 * restartPolicy Never, managed-by label) lives in exactly one place.
 */
export function buildJobFromContainer(
  container: JobContainer,
  opts: { jobName: string; namespace: string },
): V1Job {
  return {
    apiVersion: "batch/v1",
    kind: "Job",
    metadata: { name: opts.jobName, namespace: opts.namespace },
    spec: {
      backoffLimit: 0,
      template: {
        metadata: { labels: { "app.kubernetes.io/managed-by": "tempo-flow" } },
        spec: {
          restartPolicy: "Never",
          containers: [
            {
              name: "task",
              image: container.image,
              ...(container.command ? { command: container.command } : {}),
              ...(container.args && container.args.length > 0 ? { args: container.args } : {}),
              ...(container.env && container.env.length > 0 ? { env: container.env } : {}),
            },
          ],
        },
      },
    },
  }
}

/**
 * Completion-callback coordinates as env vars (independent of how params are
 * passed) so a callback-mode Job can report its result back. Shared by Job-based
 * executors.
 */
export function callbackEnv(callback?: {
  url: string
  token: string
}): { name: string; value: string }[] {
  return callback
    ? [
        { name: "TEMPO_CALLBACK_URL", value: callback.url },
        { name: "TEMPO_CALLBACK_TOKEN", value: callback.token },
      ]
    : []
}

/**
 * Build a Kubernetes Job manifest for a node. Resolved params are injected as
 * env vars (default) or appended to args as `--key=value`.
 */
export function buildJobManifest(
  node: FlowNode,
  params: Record<string, string>,
  opts: { jobName: string; callback?: { url: string; token: string } },
): V1Job {
  const cfg = node.executor as K8sExecutorConfig
  const paramsAs = cfg.paramsAs ?? "env"

  const envVars =
    paramsAs === "env" ? Object.entries(params).map(([name, value]) => ({ name, value })) : []
  envVars.push(...callbackEnv(opts.callback))

  const extraArgs = paramsAs === "args" ? Object.entries(params).map(([k, v]) => `--${k}=${v}`) : []
  const args = [...(cfg.args ?? []), ...extraArgs]

  return buildJobFromContainer(
    { image: cfg.image, command: cfg.command, args, env: envVars },
    { jobName: opts.jobName, namespace: cfg.namespace ?? DEFAULT_NAMESPACE },
  )
}

/**
 * Executes a node as a Kubernetes Job (Spring-Batch-on-K8s style). Job creation
 * and completion detection are delegated to a K8sJobRunner so this class stays
 * unit-testable without a cluster.
 */
export class K8sExecutor implements JobExecutor {
  readonly type = "k8s" as const

  constructor(private readonly runner: K8sJobRunner) {}

  async execute(node: FlowNode, ctx: RunContext): Promise<ExecResult> {
    const cfg = node.executor as K8sExecutorConfig
    const params = await resolveNodeParams(node, {
      runDate: ctx.runDate,
      overrides: ctx.params,
      item: ctx.item,
      nodes: ctx.nodeOutputs,
      secrets: ctx.secrets,
    })
    const jobName = k8sName(node.id, ctx.flowRunId)
    const manifest = buildJobManifest(node, params, { jobName, callback: ctx.callback })
    const namespace = cfg.namespace ?? DEFAULT_NAMESPACE

    ctx.onLog?.(`→ launching Job ${jobName} (${cfg.image}) in ${namespace}`)
    try {
      const result = await this.runner.run(manifest, namespace)
      if (result.logs) for (const line of result.logs.split("\n")) ctx.onLog?.(line)
      ctx.onLog?.(`← exit ${result.exitCode ?? "?"}`)
      const response = {
        jobName,
        namespace,
        exitCode: result.exitCode,
        logs: result.logs,
      }
      return {
        ok: result.succeeded,
        request: { manifest, params },
        response,
        errorMessage: result.succeeded ? undefined : (result.message ?? "Job failed"),
      }
    } catch (err) {
      return {
        ok: false,
        request: { manifest, params },
        errorMessage: (err as Error).message,
      }
    }
  }
}

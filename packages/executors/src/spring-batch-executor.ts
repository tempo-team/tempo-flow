// Copyright 2026 The tempo-flow Authors
// SPDX-License-Identifier: Apache-2.0

import type { V1Job } from "@kubernetes/client-node"
import type { FlowNode, SpringBatchExecutorConfig } from "@tempo-flow/shared-types"
import type { ExecResult, JobExecutor, RunContext } from "./executor.js"
import { type K8sJobRunner, buildJobFromContainer, callbackEnv, k8sName } from "./k8s-executor.js"
import { resolveNodeParams } from "./params.js"

const DEFAULT_NAMESPACE = "default"

/**
 * Build a Kubernetes Job manifest that launches a Spring Boot batch app. Resolved
 * node params become Spring Batch JobParameters, passed as non-option `key=value`
 * program args (the Spring Boot 3 / Batch 5 `JobLauncherApplicationRunner`
 * convention) — distinct from the k8s executor's `--key=value` option args, which
 * Spring would bind as properties. Spring config (job to run, profiles) is
 * injected as env vars so it can't collide with the JobParameters.
 */
export function buildSpringBatchManifest(
  node: FlowNode,
  params: Record<string, string>,
  opts: { jobName: string; callback?: { url: string; token: string } },
): V1Job {
  const cfg = node.executor as SpringBatchExecutorConfig
  const namespace = cfg.namespace ?? DEFAULT_NAMESPACE

  // JobParameters: non-option program args (Spring Boot parses these as JobParameters).
  const jobParamArgs = Object.entries(params).map(([k, v]) => `${k}=${v}`)

  // Spring config via env (relaxed binding → spring.batch.job.name / spring.profiles.active),
  // plus completion-callback coordinates when running in callback mode.
  const env: { name: string; value: string }[] = []
  if (cfg.jobName) env.push({ name: "SPRING_BATCH_JOB_NAME", value: cfg.jobName })
  if (cfg.profiles?.length)
    env.push({ name: "SPRING_PROFILES_ACTIVE", value: cfg.profiles.join(",") })
  env.push(...callbackEnv(opts.callback))

  return buildJobFromContainer(
    { image: cfg.image, command: cfg.command, args: jobParamArgs, env },
    { jobName: opts.jobName, namespace },
  )
}

/**
 * Executes a node as a Spring Batch job on Kubernetes. A first-class executor for
 * discoverability, but it reuses the k8s executor's cluster plumbing (manifest
 * skeleton + K8sJobRunner) so there is no duplicated Job lifecycle logic.
 */
export class SpringBatchExecutor implements JobExecutor {
  readonly type = "spring-batch" as const

  constructor(private readonly runner: K8sJobRunner) {}

  async execute(node: FlowNode, ctx: RunContext): Promise<ExecResult> {
    const cfg = node.executor as SpringBatchExecutorConfig
    const params = await resolveNodeParams(node, {
      runDate: ctx.runDate,
      overrides: ctx.params,
      item: ctx.item,
      nodes: ctx.nodeOutputs,
      secrets: ctx.secrets,
    })
    const jobName = k8sName(node.id, ctx.flowRunId)
    const manifest = buildSpringBatchManifest(node, params, { jobName, callback: ctx.callback })
    const namespace = cfg.namespace ?? DEFAULT_NAMESPACE

    ctx.onLog?.(`→ launching Spring Batch Job ${jobName} (${cfg.image}) in ${namespace}`)
    try {
      const result = await this.runner.run(manifest, namespace)
      if (result.logs) for (const line of result.logs.split("\n")) ctx.onLog?.(line)
      ctx.onLog?.(`← exit ${result.exitCode ?? "?"}`)
      return {
        ok: result.succeeded,
        request: { manifest, params },
        response: { jobName, namespace, exitCode: result.exitCode, logs: result.logs },
        errorMessage: result.succeeded ? undefined : (result.message ?? "Spring Batch job failed"),
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

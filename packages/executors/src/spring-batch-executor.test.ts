// Copyright 2026 The tempo-flow Authors
// SPDX-License-Identifier: Apache-2.0

import type { FlowNode } from "@tempo-flow/shared-types"
import { describe, expect, it, vi } from "vitest"
import type { RunContext } from "./executor.js"
import type { K8sJobResult, K8sJobRunner } from "./k8s-executor.js"
import { SpringBatchExecutor, buildSpringBatchManifest } from "./spring-batch-executor.js"

const ctx: RunContext = { flowRunId: "RUN_ABC", nodeId: "n1", runDate: new Date(2026, 5, 20) }

function springNode(extra: Partial<FlowNode["executor"]> = {}): FlowNode {
  return {
    id: "import",
    name: "import",
    executor: { type: "spring-batch", image: "ghcr.io/acme/batch:1.0", ...extra } as never,
    params: { dateParams: [{ key: "targetDate", expr: "${RUN_DATE}", format: "yyyyMMdd" }] },
  }
}

describe("buildSpringBatchManifest", () => {
  it("passes JobParameters as non-option key=value program args", () => {
    const job = buildSpringBatchManifest(
      springNode(),
      { targetDate: "20260620" },
      { jobName: "j1" },
    )
    const container = job.spec?.template.spec?.containers[0]
    expect(container?.image).toBe("ghcr.io/acme/batch:1.0")
    // key=value (NOT --key=value, which Spring would bind as a property)
    expect(container?.args).toEqual(["targetDate=20260620"])
    expect(job.spec?.backoffLimit).toBe(0)
    expect(job.spec?.template.spec?.restartPolicy).toBe("Never")
  })

  it("injects jobName and profiles as Spring env vars", () => {
    const job = buildSpringBatchManifest(
      springNode({ jobName: "importUserJob", profiles: ["prod", "batch"] } as never),
      {},
      { jobName: "j1" },
    )
    const env = job.spec?.template.spec?.containers[0]?.env
    expect(env).toContainEqual({ name: "SPRING_BATCH_JOB_NAME", value: "importUserJob" })
    expect(env).toContainEqual({ name: "SPRING_PROFILES_ACTIVE", value: "prod,batch" })
  })

  it("omits Spring env vars when not configured", () => {
    const job = buildSpringBatchManifest(springNode(), {}, { jobName: "j1" })
    expect(job.spec?.template.spec?.containers[0]?.env).toBeUndefined()
  })

  it("honors the configured namespace and command override", () => {
    const job = buildSpringBatchManifest(
      springNode({ namespace: "batch", command: ["java", "-jar", "app.jar"] } as never),
      {},
      { jobName: "j1" },
    )
    expect(job.metadata?.namespace).toBe("batch")
    expect(job.spec?.template.spec?.containers[0]?.command).toEqual(["java", "-jar", "app.jar"])
  })

  it("injects callback coordinates as env when in callback mode", () => {
    const job = buildSpringBatchManifest(
      springNode(),
      { targetDate: "20260620" },
      { jobName: "j1", callback: { url: "https://host/api/callbacks/tok", token: "tok" } },
    )
    const env = job.spec?.template.spec?.containers[0]?.env
    expect(env).toContainEqual({
      name: "TEMPO_CALLBACK_URL",
      value: "https://host/api/callbacks/tok",
    })
    expect(env).toContainEqual({ name: "TEMPO_CALLBACK_TOKEN", value: "tok" })
    // JobParameters still go to args, not env
    expect(job.spec?.template.spec?.containers[0]?.args).toEqual(["targetDate=20260620"])
  })
})

describe("SpringBatchExecutor", () => {
  it("returns ok when the runner reports success", async () => {
    const runner: K8sJobRunner = {
      run: vi.fn(
        async (): Promise<K8sJobResult> => ({ succeeded: true, exitCode: 0, logs: "done" }),
      ),
    }
    const exec = new SpringBatchExecutor(runner)
    const result = await exec.execute(springNode(), ctx)
    expect(result.ok).toBe(true)
    expect((result.response as { exitCode: number }).exitCode).toBe(0)
  })

  it("resolves dateParams into JobParameters", async () => {
    const runner: K8sJobRunner = {
      run: vi.fn(async (): Promise<K8sJobResult> => ({ succeeded: true, exitCode: 0 })),
    }
    const exec = new SpringBatchExecutor(runner)
    await exec.execute(springNode(), ctx)
    const manifest = (runner.run as ReturnType<typeof vi.fn>).mock.calls[0][0]
    expect(manifest.spec?.template.spec?.containers[0]?.args).toEqual(["targetDate=20260620"])
  })

  it("returns failure with message when the Job fails", async () => {
    const runner: K8sJobRunner = {
      run: async (): Promise<K8sJobResult> => ({ succeeded: false, exitCode: 1, message: "boom" }),
    }
    const exec = new SpringBatchExecutor(runner)
    const result = await exec.execute(springNode(), ctx)
    expect(result.ok).toBe(false)
    expect(result.errorMessage).toBe("boom")
  })
})

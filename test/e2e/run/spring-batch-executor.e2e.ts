// Copyright 2026 The tempo-flow Authors
// SPDX-License-Identifier: Apache-2.0
//
// Spring Batch executor: a node runs a Spring Boot batch app as a one-shot K8s
// Job. The KEY contract (distinct from the k8s executor) is that resolved params
// are passed as non-option `key=value` JobParameter args (NOT `--key=value`) and
// Spring config is injected as env (SPRING_BATCH_JOB_NAME / SPRING_PROFILES_ACTIVE).
//
// This uses a lightweight STAND-IN image (busybox + command override) that
// asserts the contract via exit code + logs — enough to verify the executor→
// cluster wiring without building a JVM image. Real Spring runtime behavior is
// only covered by a real Spring Boot batch image (see README option A).
// Gated behind E2E_K8S (needs minikube; namespace via E2E_NAMESPACE).

import { describe, expect, it } from "vitest"
import { createFlow, manualRun, node } from "../setup/builders"
import { CAP } from "../setup/config"
import { nodeRun, waitForTerminal } from "../setup/wait"

const NS = process.env.E2E_NAMESPACE ?? "default"
const JOB_TIMEOUT = 180_000

// Stand-in that echoes the first program arg + Spring env, and fails if the arg
// is option-style (--key=value) — proving JobParameters are passed as key=value.
const CONTRACT = [
  'echo "ARG0=$0"',
  'echo "JOB=$SPRING_BATCH_JOB_NAME"',
  'echo "PROFILES=$SPRING_PROFILES_ACTIVE"',
  'case "$0" in --*) exit 3 ;; *=*) exit 0 ;; *) exit 4 ;; esac',
].join("; ")

describe.runIf(CAP.k8s)("spring-batch executor", () => {
  it(
    "passes JobParameters as key=value args and Spring config as env",
    async () => {
      const flow = await createFlow({
        nodes: [
          node(
            "batch",
            {
              type: "spring-batch",
              image: "busybox:1.36",
              command: ["sh", "-c", CONTRACT],
              jobName: "importUserJob",
              profiles: ["prod", "batch"],
              namespace: NS,
            },
            {
              params: {
                dateParams: [{ key: "targetDate", expr: "${RUN_DATE}", format: "yyyyMMdd" }],
              },
            },
          ),
        ],
      })
      const run = await waitForTerminal(
        await manualRun(flow.id, { runDate: "2026-01-15T12:00:00.000Z" }),
        { timeout: JOB_TIMEOUT },
      )
      expect(run.status).toBe("SUCCESS") // exit 0 ⇒ arg was key=value, not --key=value
      const logs = (nodeRun(run, "batch")?.response as { logs?: string }).logs ?? ""
      expect(logs).toMatch(/ARG0=targetDate=2026\d{4}/)
      expect(logs).toContain("JOB=importUserJob")
      expect(logs).toContain("PROFILES=prod,batch")
    },
    JOB_TIMEOUT,
  )

  it(
    "fails the node when the batch Job exits non-zero",
    async () => {
      const flow = await createFlow({
        nodes: [
          node("batch", {
            type: "spring-batch",
            image: "busybox:1.36",
            command: ["sh", "-c", "exit 1"],
            namespace: NS,
          }),
        ],
      })
      const run = await waitForTerminal(await manualRun(flow.id), { timeout: JOB_TIMEOUT })
      expect(run.status).toBe("FAILED")
    },
    JOB_TIMEOUT,
  )
})

// Copyright 2026 The tempo-flow Authors
// SPDX-License-Identifier: Apache-2.0
//
// Event trigger: a message published to a Redis Stream (XADD) launches a run
// when the trigger's exact-match filter is satisfied; non-matching messages are
// ignored. Message fields flow through as run params.

import { afterEach, describe, expect, it } from "vitest"
import { createFlow, httpNode } from "../setup/builders"
import { admin } from "../setup/client"
import { redisCli } from "../setup/proc"
import { type RunView, nodeRun, waitFor, waitForTerminal } from "../setup/wait"

let topicSeq = 0
const nextTopic = () => `orders-${topicSeq++}`

// Track created triggers and remove them in cleanup so the adapter re-subscribes
// (reload) to nothing — otherwise it keeps polling a flushed stream and logs
// noisy NOGROUP warnings until the next event test runs.
const created: Array<{ flowId: string; triggerId: string }> = []

afterEach(async () => {
  const c = await admin()
  for (const { flowId, triggerId } of created.splice(0)) {
    await c.del(`/api/flows/${flowId}/event-triggers/${triggerId}`).catch(() => undefined)
  }
})

async function createEventTrigger(
  flowId: string,
  topic: string,
  filter?: Record<string, string>,
): Promise<void> {
  const c = await admin()
  const res = await c.post<{ id: string }>(`/api/flows/${flowId}/event-triggers`, {
    source: "redis",
    topic,
    ...(filter ? { filter } : {}),
  })
  if (res.status >= 300) throw new Error(`event-trigger create failed: ${res.status}`)
  created.push({ flowId, triggerId: res.body.id })
}

async function publish(topic: string, fields: Record<string, string>): Promise<void> {
  const flat = Object.entries(fields).flat()
  await redisCli(["XADD", topic, "*", ...flat])
}

async function runsFor(flowId: string): Promise<RunView[]> {
  const c = await admin()
  return (await c.get<RunView[]>(`/api/flows/${flowId}/runs`)).body
}

describe("event trigger", () => {
  it("launches a run when a matching message is published; fields become params", async () => {
    const flow = await createFlow({ nodes: [httpNode("a", "/echo")] })
    const topic = nextTopic()
    await createEventTrigger(flow.id, topic, { status: "shipped" })

    await publish(topic, { orderId: "A1", status: "shipped" })

    const runs = await waitFor(
      () => runsFor(flow.id),
      (rs) => rs.length === 1,
      {
        label: "event run created",
      },
    )
    expect(runs[0].trigger).toBe("event")
    const run = await waitForTerminal(runs[0].id)
    const params = (nodeRun(run, "a")?.request as { params?: Record<string, string> }).params
    expect(params?.orderId).toBe("A1")
    expect(params?.status).toBe("shipped")
  })

  it("ignores a message that fails the filter", async () => {
    const flow = await createFlow({ nodes: [httpNode("a", "/echo")] })
    const topic = nextTopic()
    await createEventTrigger(flow.id, topic, { status: "shipped" })

    await publish(topic, { orderId: "A2", status: "pending" })

    // Give the consumer time to read + (not) act, then assert no run appeared.
    await new Promise((r) => setTimeout(r, 1500))
    expect(await runsFor(flow.id)).toHaveLength(0)
  })

  it("launches with no filter (any message on the topic)", async () => {
    const flow = await createFlow({ nodes: [httpNode("a", "/echo")] })
    const topic = nextTopic()
    await createEventTrigger(flow.id, topic)

    await publish(topic, { anything: "goes" })
    const runs = await waitFor(
      () => runsFor(flow.id),
      (rs) => rs.length === 1,
      {
        label: "unfiltered event run",
      },
    )
    await waitForTerminal(runs[0].id)
  })

  it("fires every flow subscribed to the same topic", async () => {
    const flowA = await createFlow({ nodes: [httpNode("a", "/echo")] })
    const flowB = await createFlow({ nodes: [httpNode("a", "/echo")] })
    const topic = nextTopic()
    await createEventTrigger(flowA.id, topic)
    await createEventTrigger(flowB.id, topic)

    await publish(topic, { id: "x" })

    const runsA = await waitFor(
      () => runsFor(flowA.id),
      (rs) => rs.length === 1,
      {
        label: "flow A event run",
      },
    )
    const runsB = await waitFor(
      () => runsFor(flowB.id),
      (rs) => rs.length === 1,
      {
        label: "flow B event run",
      },
    )
    await waitForTerminal(runsA[0].id)
    await waitForTerminal(runsB[0].id)
  })
})

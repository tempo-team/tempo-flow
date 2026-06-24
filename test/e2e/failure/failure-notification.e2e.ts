// Copyright 2026 The tempo-flow Authors
// SPDX-License-Identifier: Apache-2.0
//
// On a failed run, the notification pipeline dispatches to the enabled channels.
// We wire the webhook channel at the fixture and assert it received the alert.

import { describe, expect, it } from "vitest"
import { createFlow, httpNode, manualRun } from "../setup/builders"
import { admin } from "../setup/client"
import { fixtureCalls, fixtureUrl } from "../setup/fixture-client"
import { waitFor, waitForTerminal } from "../setup/wait"

describe("failure notification", () => {
  it("dispatches a webhook notification when a run fails", async () => {
    const c = await admin()
    const set = await c.put("/api/settings/notifications", {
      webhook: { enabled: true, url: fixtureUrl("/notify-sink"), secret: "" },
      events: { failed: true, completed: false, retryExhausted: true },
    })
    expect(set.status).toBeLessThan(300)

    const flow = await createFlow({ nodes: [httpNode("a", "/fail/500")] })
    const run = await waitForTerminal(await manualRun(flow.id))
    expect(run.status).toBe("FAILED")

    const calls = await waitFor(
      () => fixtureCalls("/notify-sink"),
      (cs) => cs.length >= 1,
      {
        timeout: 10_000,
        label: "failure notification delivered",
      },
    )
    expect(calls.length).toBeGreaterThanOrEqual(1)
  })
})

// Copyright 2026 The tempo-flow Authors
// SPDX-License-Identifier: Apache-2.0

import { useEffect, useMemo, useState } from "react"
import { useParams } from "react-router-dom"
import { Background, Controls, ReactFlow } from "@xyflow/react"
import "@xyflow/react/dist/style.css"
import { type FlowRunSummary, type FlowSummary, api } from "../lib/api"
import { useAuth } from "../lib/auth"
import { toReactFlow } from "../lib/flow-graph"

const STATUS_COLOR: Record<string, string> = {
  SUCCESS: "#16a34a",
  FAILED: "#dc2626",
  RUNNING: "#2563eb",
  PENDING: "#a16207",
  CANCELED: "#64748b",
}

export function FlowPage(): JSX.Element {
  const { id = "" } = useParams()
  const { can } = useAuth()
  const [flow, setFlow] = useState<FlowSummary | null>(null)
  const [runs, setRuns] = useState<FlowRunSummary[]>([])
  const [error, setError] = useState<string | null>(null)

  async function reloadRuns(): Promise<void> {
    setRuns(await api.listRuns(id))
  }

  useEffect(() => {
    api
      .getFlow(id)
      .then(setFlow)
      .catch((e: Error) => setError(e.message))
    reloadRuns().catch(() => undefined)
  }, [id])

  const graph = useMemo(() => (flow ? toReactFlow(flow.definition) : null), [flow])

  if (error) return <p style={{ color: "#dc2626" }}>{error}</p>
  if (!flow || !graph) return <p>Loading…</p>

  async function runNow(): Promise<void> {
    await api.runFlow(id, {})
    await reloadRuns()
  }

  return (
    <section>
      <h2>{flow.name}</h2>
      {flow.description && <p style={{ color: "#64748b" }}>{flow.description}</p>}

      {can("execute", "flow") && (
        <button onClick={runNow} style={{ marginBottom: 12 }}>
          ▶ Run now
        </button>
      )}

      <div style={{ height: 360, border: "1px solid #e2e8f0", borderRadius: 8 }}>
        <ReactFlow nodes={graph.nodes} edges={graph.edges} fitView>
          <Background />
          <Controls />
        </ReactFlow>
      </div>

      <h3 style={{ marginTop: 24 }}>Runs</h3>
      <table style={{ borderCollapse: "collapse", width: "100%" }}>
        <thead>
          <tr style={{ textAlign: "left", borderBottom: "1px solid #e2e8f0" }}>
            <th style={{ padding: 8 }}>Status</th>
            <th style={{ padding: 8 }}>Trigger</th>
            <th style={{ padding: 8 }}>Started</th>
            <th style={{ padding: 8 }}>Finished</th>
          </tr>
        </thead>
        <tbody>
          {runs.map((r) => (
            <tr key={r.id} style={{ borderBottom: "1px solid #f1f5f9" }}>
              <td style={{ padding: 8, color: STATUS_COLOR[r.status] ?? "#0f172a" }}>{r.status}</td>
              <td style={{ padding: 8 }}>{r.trigger}</td>
              <td style={{ padding: 8 }}>{r.startedAt ?? "—"}</td>
              <td style={{ padding: 8 }}>{r.finishedAt ?? "—"}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </section>
  )
}

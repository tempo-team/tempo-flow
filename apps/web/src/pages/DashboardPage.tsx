// Copyright 2026 The tempo-flow Authors
// SPDX-License-Identifier: Apache-2.0

import { useEffect, useState } from "react"
import { Link } from "react-router-dom"
import { type FlowSummary, api } from "../lib/api"

export function DashboardPage(): JSX.Element {
  const [flows, setFlows] = useState<FlowSummary[]>([])
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    api
      .listFlows()
      .then(setFlows)
      .catch((e: Error) => setError(e.message))
  }, [])

  if (error) return <p style={{ color: "#dc2626" }}>{error}</p>

  return (
    <section>
      <h2>Flows</h2>
      {flows.length === 0 && <p style={{ color: "#64748b" }}>No flows yet.</p>}
      <table style={{ borderCollapse: "collapse", width: "100%" }}>
        <thead>
          <tr style={{ textAlign: "left", borderBottom: "1px solid #e2e8f0" }}>
            <th style={{ padding: 8 }}>Name</th>
            <th style={{ padding: 8 }}>Trigger</th>
            <th style={{ padding: 8 }}>Enabled</th>
            <th style={{ padding: 8 }}>Nodes</th>
          </tr>
        </thead>
        <tbody>
          {flows.map((f) => (
            <tr key={f.id} style={{ borderBottom: "1px solid #f1f5f9" }}>
              <td style={{ padding: 8 }}>
                <Link to={`/flows/${f.id}`}>{f.name}</Link>
              </td>
              <td style={{ padding: 8 }}>
                {f.trigger.type === "cron" ? `cron ${f.trigger.expr}` : "manual"}
              </td>
              <td style={{ padding: 8 }}>{f.enabled ? "✅" : "⏸️"}</td>
              <td style={{ padding: 8 }}>{f.definition.nodes.length}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </section>
  )
}

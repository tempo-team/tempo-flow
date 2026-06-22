// Copyright 2026 The tempo-flow Authors
// SPDX-License-Identifier: Apache-2.0

import { useEffect, useState } from "react"
import { History, RotateCcw } from "lucide-react"
import { toast } from "sonner"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { type FlowVersion, api } from "@/lib/api"
import { useAuth } from "@/lib/auth"

function nodeCount(definition: string): number {
  try {
    return (JSON.parse(definition) as { nodes?: unknown[] }).nodes?.length ?? 0
  } catch {
    return 0
  }
}

export function VersionHistory({ flowId, onRestored }: { flowId: string; onRestored: () => void }) {
  const { can } = useAuth()
  const [versions, setVersions] = useState<FlowVersion[] | null>(null)

  function reload(): void {
    api
      .listVersions(flowId)
      .then(setVersions)
      .catch((e: Error) => toast.error("Failed to load versions", { description: e.message }))
  }
  useEffect(reload, [flowId])

  async function restore(version: number): Promise<void> {
    try {
      await api.restoreVersion(flowId, version)
      toast.success(`Restored version ${version}`)
      reload()
      onRestored()
    } catch (e) {
      toast.error("Restore failed", { description: (e as Error).message })
    }
  }

  if (versions && versions.length === 0) return null

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2 text-base">
          <History className="size-4" /> Version history
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-2">
        {versions?.map((v) => (
          <div
            key={v.id}
            className="flex items-center justify-between rounded-md border p-2 text-sm"
          >
            <div className="flex items-center gap-3">
              <span className="font-mono text-xs text-muted-foreground">v{v.version}</span>
              <span className="font-medium">{v.name}</span>
              <span className="text-xs text-muted-foreground">{nodeCount(v.definition)} nodes</span>
              <span className="text-xs text-muted-foreground">
                {new Date(v.createdAt).toLocaleString()}
              </span>
            </div>
            {can("edit", "flow") && (
              <Button variant="outline" size="sm" onClick={() => restore(v.version)}>
                <RotateCcw className="mr-1 size-4" /> Restore
              </Button>
            )}
          </div>
        ))}
      </CardContent>
    </Card>
  )
}

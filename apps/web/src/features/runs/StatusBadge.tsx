// Copyright 2026 The tempo-flow Authors
// SPDX-License-Identifier: Apache-2.0

import { Badge } from "@/components/ui/badge"
import { cn } from "@/lib/utils"

const STYLES: Record<string, string> = {
  SUCCESS: "bg-emerald-500/15 text-emerald-600 dark:text-emerald-400",
  FAILED: "bg-destructive/15 text-destructive",
  RUNNING: "bg-blue-500/15 text-blue-600 dark:text-blue-400",
  PENDING: "bg-amber-500/15 text-amber-600 dark:text-amber-400",
  PENDING_APPROVAL: "bg-purple-500/15 text-purple-600 dark:text-purple-400",
  CANCELED: "bg-muted text-muted-foreground",
}

export function StatusBadge({ status }: { status: string }) {
  return (
    <Badge variant="secondary" className={cn("font-medium", STYLES[status])}>
      {status}
    </Badge>
  )
}

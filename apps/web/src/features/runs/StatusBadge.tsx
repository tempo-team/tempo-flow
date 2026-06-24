// Copyright 2026 The tempo-flow Authors
// SPDX-License-Identifier: Apache-2.0

import { Badge } from "@/components/ui/badge"
import { isActiveStatus, statusBadgeClass } from "@/lib/status"
import { cn } from "@/lib/utils"

export function StatusBadge({ status }: { status: string }) {
  return (
    <Badge variant="secondary" className={cn("gap-1.5 font-medium", statusBadgeClass(status))}>
      {isActiveStatus(status) && (
        <span className="size-1.5 animate-pulse rounded-full bg-current" />
      )}
      {status}
    </Badge>
  )
}

// Copyright 2026 The tempo-flow Authors
// SPDX-License-Identifier: Apache-2.0

import { useState } from "react"
import { Plus, X } from "lucide-react"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"

interface Props {
  label: string
  value: Record<string, string>
  onChange: (next: Record<string, string>) => void
  keyPlaceholder?: string
  valuePlaceholder?: string
}

interface Row {
  id: number
  k: string
  v: string
}

/**
 * Edit a string→string map. Rows are held in local state with stable ids so
 * blank rows and in-progress duplicate keys can coexist while typing (the map
 * representation alone would collapse them). Only non-empty keys are emitted.
 *
 * Local state is seeded once on mount, so the parent must remount this editor
 * (via a `key`) when it swaps to a different underlying object.
 */
export function KeyValueEditor({
  label,
  value,
  onChange,
  keyPlaceholder = "key",
  valuePlaceholder = "value",
}: Props) {
  const [rows, setRows] = useState<Row[]>(() =>
    Object.entries(value).map(([k, v], i) => ({ id: i, k, v })),
  )
  const [nextId, setNextId] = useState(rows.length)

  function commit(next: Row[]): void {
    setRows(next)
    const out: Record<string, string> = {}
    for (const r of next) if (r.k !== "") out[r.k] = r.v
    onChange(out)
  }
  function update(id: number, patch: Partial<Row>): void {
    commit(rows.map((r) => (r.id === id ? { ...r, ...patch } : r)))
  }
  function remove(id: number): void {
    commit(rows.filter((r) => r.id !== id))
  }
  function add(): void {
    setRows([...rows, { id: nextId, k: "", v: "" }])
    setNextId(nextId + 1)
  }

  const dupes = new Set(
    rows
      .filter((r) => r.k !== "")
      .map((r) => r.k)
      .filter((k, i, a) => a.indexOf(k) !== i),
  )

  return (
    <div className="space-y-2">
      <div className="flex items-center justify-between">
        <span className="text-xs font-medium text-muted-foreground">{label}</span>
        <Button type="button" variant="ghost" size="xs" onClick={add}>
          <Plus className="size-3" /> Add
        </Button>
      </div>
      {rows.length === 0 && <p className="text-xs text-muted-foreground">None</p>}
      {rows.map((r) => (
        <div key={r.id} className="flex gap-2">
          <Input
            value={r.k}
            placeholder={keyPlaceholder}
            aria-invalid={dupes.has(r.k)}
            onChange={(e) => update(r.id, { k: e.target.value })}
            className="h-8"
          />
          <Input
            value={r.v}
            placeholder={valuePlaceholder}
            onChange={(e) => update(r.id, { v: e.target.value })}
            className="h-8"
          />
          <Button type="button" variant="ghost" size="icon-sm" onClick={() => remove(r.id)}>
            <X className="size-3" />
          </Button>
        </div>
      ))}
      {dupes.size > 0 && (
        <p className="text-xs text-destructive">Duplicate keys are ignored; rename them.</p>
      )}
    </div>
  )
}

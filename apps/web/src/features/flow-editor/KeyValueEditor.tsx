// Copyright 2026 The tempo-flow Authors
// SPDX-License-Identifier: Apache-2.0

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

/** Edit a string→string map as a list of key/value rows. */
export function KeyValueEditor({
  label,
  value,
  onChange,
  keyPlaceholder = "key",
  valuePlaceholder = "value",
}: Props) {
  const entries = Object.entries(value)

  function update(index: number, k: string, v: string): void {
    const next = entries.map((e, i) => (i === index ? [k, v] : e))
    onChange(Object.fromEntries(next))
  }
  function remove(index: number): void {
    onChange(Object.fromEntries(entries.filter((_, i) => i !== index)))
  }
  function add(): void {
    onChange({ ...value, "": "" })
  }

  return (
    <div className="space-y-2">
      <div className="flex items-center justify-between">
        <span className="text-xs font-medium text-muted-foreground">{label}</span>
        <Button type="button" variant="ghost" size="xs" onClick={add}>
          <Plus className="size-3" /> Add
        </Button>
      </div>
      {entries.length === 0 && <p className="text-xs text-muted-foreground">None</p>}
      {entries.map(([k, v], i) => (
        <div key={i} className="flex gap-2">
          <Input
            value={k}
            placeholder={keyPlaceholder}
            onChange={(e) => update(i, e.target.value, v)}
            className="h-8"
          />
          <Input
            value={v}
            placeholder={valuePlaceholder}
            onChange={(e) => update(i, k, e.target.value)}
            className="h-8"
          />
          <Button type="button" variant="ghost" size="icon-sm" onClick={() => remove(i)}>
            <X className="size-3" />
          </Button>
        </div>
      ))}
    </div>
  )
}

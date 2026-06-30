// Copyright 2026 The tempo-flow Authors
// SPDX-License-Identifier: Apache-2.0

import { useState } from "react"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select"
import { cn } from "@/lib/utils"

// ── Types ─────────────────────────────────────────────────────────────────────

type SimpleType = "seconds" | "minutes" | "hours" | "daily" | "weekly" | "monthly"

interface SimpleState {
  type: SimpleType
  every: number // seconds / minutes / hours
  hour: number // daily / weekly / monthly — HH
  minute: number // daily / weekly / monthly — MM
  dayOfWeek: number // weekly: 0=Sun 1=Mon … 6=Sat
  dayOfMonth: number // monthly: 1–31
}

const DOW_LABELS = ["Sunday", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"]

// ── Conversion helpers ─────────────────────────────────────────────────────────

function toExpr(s: SimpleState): string {
  switch (s.type) {
    case "seconds":
      return `*/${s.every} * * * * *`
    case "minutes":
      return `0 */${s.every} * * * *`
    case "hours":
      return `0 0 */${s.every} * * *`
    case "daily":
      return `0 ${s.minute} ${s.hour} * * *`
    case "weekly":
      return `0 ${s.minute} ${s.hour} * * ${s.dayOfWeek}`
    case "monthly":
      return `0 ${s.minute} ${s.hour} ${s.dayOfMonth} * *`
  }
}

function parseSimple(expr: string): SimpleState | null {
  const parts = expr.trim().split(/\s+/)
  if (parts.length !== 6) return null
  const [sec, min, hr, day, month, dow] = parts

  const base: SimpleState = {
    type: "daily",
    every: 1,
    hour: 0,
    minute: 0,
    dayOfWeek: 1,
    dayOfMonth: 1,
  }

  // */N * * * * *  → every N seconds
  if (
    sec.startsWith("*/") &&
    min === "*" &&
    hr === "*" &&
    day === "*" &&
    month === "*" &&
    dow === "*"
  ) {
    const n = parseInt(sec.slice(2))
    if (n > 0 && n <= 59) return { ...base, type: "seconds", every: n }
  }
  // 0 */N * * * *  → every N minutes
  if (
    sec === "0" &&
    min.startsWith("*/") &&
    hr === "*" &&
    day === "*" &&
    month === "*" &&
    dow === "*"
  ) {
    const n = parseInt(min.slice(2))
    if (n > 0 && n <= 59) return { ...base, type: "minutes", every: n }
  }
  // 0 0 */N * * *  → every N hours
  if (
    sec === "0" &&
    min === "0" &&
    hr.startsWith("*/") &&
    day === "*" &&
    month === "*" &&
    dow === "*"
  ) {
    const n = parseInt(hr.slice(2))
    if (n > 0 && n <= 23) return { ...base, type: "hours", every: n }
  }

  // For fixed-time patterns, validate HH and MM first
  const h = parseInt(hr),
    m = parseInt(min)
  const validTime =
    !isNaN(h) &&
    !isNaN(m) &&
    h >= 0 &&
    h <= 23 &&
    m >= 0 &&
    m <= 59 &&
    String(h) === hr &&
    String(m) === min
  if (sec !== "0" || !validTime) return null

  // 0 MM HH * * *   → daily
  if (day === "*" && month === "*" && dow === "*") {
    return { ...base, type: "daily", hour: h, minute: m }
  }
  // 0 MM HH * * DOW → weekly
  if (day === "*" && month === "*" && dow !== "*") {
    const d = parseInt(dow)
    if (!isNaN(d) && d >= 0 && d <= 6 && String(d) === dow) {
      return { ...base, type: "weekly", hour: h, minute: m, dayOfWeek: d }
    }
  }
  // 0 MM HH DOM * * → monthly
  if (day !== "*" && month === "*" && dow === "*") {
    const dom = parseInt(day)
    if (!isNaN(dom) && dom >= 1 && dom <= 31 && String(dom) === day) {
      return { ...base, type: "monthly", hour: h, minute: m, dayOfMonth: dom }
    }
  }

  return null
}

function ordinal(n: number): string {
  const s = ["th", "st", "nd", "rd"]
  const v = n % 100
  return n + (s[(v - 20) % 10] ?? s[v] ?? s[0])
}

function describeExpr(expr: string): string {
  const s = parseSimple(expr)
  if (!s) return "Custom expression"
  const hh = String(s.hour).padStart(2, "0")
  const mm = String(s.minute).padStart(2, "0")
  switch (s.type) {
    case "seconds":
      return `Every ${s.every} second${s.every > 1 ? "s" : ""}`
    case "minutes":
      return `Every ${s.every} minute${s.every > 1 ? "s" : ""}`
    case "hours":
      return `Every ${s.every} hour${s.every > 1 ? "s" : ""}`
    case "daily":
      return `Every day at ${hh}:${mm}`
    case "weekly":
      return `Every ${DOW_LABELS[s.dayOfWeek]} at ${hh}:${mm}`
    case "monthly":
      return `Every month on the ${ordinal(s.dayOfMonth)} at ${hh}:${mm}`
  }
}

// ── Field chips for Advanced mode ──────────────────────────────────────────────

const FIELD_CHIPS: Record<string, { label: string; value: string }[]> = {
  sec: [
    { label: "every", value: "*" },
    { label: "0", value: "0" },
    { label: "*/5", value: "*/5" },
    { label: "*/10", value: "*/10" },
    { label: "*/30", value: "*/30" },
  ],
  min: [
    { label: "every", value: "*" },
    { label: "0", value: "0" },
    { label: "*/5", value: "*/5" },
    { label: "*/15", value: "*/15" },
    { label: "*/30", value: "*/30" },
  ],
  hour: [
    { label: "every", value: "*" },
    { label: "0", value: "0" },
    { label: "*/2", value: "*/2" },
    { label: "*/6", value: "*/6" },
    { label: "*/12", value: "*/12" },
  ],
  day: [
    { label: "every", value: "*" },
    { label: "1st", value: "1" },
    { label: "15th", value: "15" },
    { label: "last", value: "L" },
  ],
  month: [
    { label: "every", value: "*" },
    { label: "Jan", value: "1" },
    { label: "Apr", value: "4" },
    { label: "Jul", value: "7" },
    { label: "Oct", value: "10" },
  ],
  weekday: [
    { label: "every", value: "*" },
    { label: "Mon–Fri", value: "1-5" },
    { label: "Mon", value: "1" },
    { label: "Fri", value: "5" },
    { label: "Sat,Sun", value: "6,0" },
  ],
}

const FIELD_LABELS = ["Second", "Minute", "Hour", "Day", "Month", "Weekday"]
const FIELD_KEYS = ["sec", "min", "hour", "day", "month", "weekday"]

// ── Sub-components ─────────────────────────────────────────────────────────────

function Chip({
  active,
  children,
  onClick,
}: {
  active: boolean
  children: React.ReactNode
  onClick: () => void
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={cn(
        "rounded px-1.5 py-0.5 font-mono text-[11px] transition",
        active
          ? "bg-primary text-primary-foreground"
          : "bg-muted text-muted-foreground hover:bg-muted/70",
      )}
    >
      {children}
    </button>
  )
}

function TimePicker({
  hour,
  minute,
  onChange,
}: {
  hour: number
  minute: number
  onChange: (h: number, m: number) => void
}) {
  return (
    <div className="grid gap-1">
      <Label className="text-xs">At</Label>
      <div className="flex items-center gap-1">
        <Input
          type="number"
          min={0}
          max={23}
          value={String(hour).padStart(2, "0")}
          onChange={(e) => {
            const n = parseInt(e.target.value)
            if (!isNaN(n) && n >= 0 && n <= 23) onChange(n, minute)
          }}
          className="w-16 font-mono text-center"
        />
        <span className="text-muted-foreground">:</span>
        <Input
          type="number"
          min={0}
          max={59}
          value={String(minute).padStart(2, "0")}
          onChange={(e) => {
            const n = parseInt(e.target.value)
            if (!isNaN(n) && n >= 0 && n <= 59) onChange(hour, n)
          }}
          className="w-16 font-mono text-center"
        />
      </div>
    </div>
  )
}

function SimpleBuilder({
  state,
  onChange,
}: {
  state: SimpleState
  onChange: (patch: Partial<SimpleState>) => void
}) {
  return (
    <div className="flex flex-wrap items-end gap-3">
      {/* Type selector */}
      <div className="grid gap-1">
        <Label className="text-xs">Run</Label>
        <Select value={state.type} onValueChange={(v) => onChange({ type: v as SimpleType })}>
          <SelectTrigger className="w-40">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="seconds">Every N seconds</SelectItem>
            <SelectItem value="minutes">Every N minutes</SelectItem>
            <SelectItem value="hours">Every N hours</SelectItem>
            <SelectItem value="daily">Daily</SelectItem>
            <SelectItem value="weekly">Weekly</SelectItem>
            <SelectItem value="monthly">Monthly</SelectItem>
          </SelectContent>
        </Select>
      </div>

      {/* Interval input — seconds / minutes / hours */}
      {(state.type === "seconds" || state.type === "minutes" || state.type === "hours") && (
        <div className="grid gap-1">
          <Label className="text-xs">Every</Label>
          <div className="flex items-center gap-1.5">
            <Input
              type="number"
              min={1}
              max={state.type === "hours" ? 23 : 59}
              value={state.every}
              onChange={(e) => {
                const n = parseInt(e.target.value)
                if (!isNaN(n) && n > 0) onChange({ every: n })
              }}
              className="w-20 font-mono"
            />
            <span className="text-sm text-muted-foreground">
              {state.type === "seconds" ? "sec" : state.type === "minutes" ? "min" : "hr"}
            </span>
          </div>
        </div>
      )}

      {/* Day-of-week — weekly */}
      {state.type === "weekly" && (
        <div className="grid gap-1">
          <Label className="text-xs">On</Label>
          <Select
            value={String(state.dayOfWeek)}
            onValueChange={(v) => onChange({ dayOfWeek: parseInt(v) })}
          >
            <SelectTrigger className="w-36">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {DOW_LABELS.map((label, i) => (
                <SelectItem key={i} value={String(i)}>
                  {label}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
      )}

      {/* Day-of-month — monthly */}
      {state.type === "monthly" && (
        <div className="grid gap-1">
          <Label className="text-xs">On day</Label>
          <Input
            type="number"
            min={1}
            max={31}
            value={state.dayOfMonth}
            onChange={(e) => {
              const n = parseInt(e.target.value)
              if (!isNaN(n) && n >= 1 && n <= 31) onChange({ dayOfMonth: n })
            }}
            className="w-20 font-mono"
          />
        </div>
      )}

      {/* Time picker — daily / weekly / monthly */}
      {(state.type === "daily" || state.type === "weekly" || state.type === "monthly") && (
        <TimePicker
          hour={state.hour}
          minute={state.minute}
          onChange={(h, m) => onChange({ hour: h, minute: m })}
        />
      )}
    </div>
  )
}

function AdvancedBuilder({
  fields,
  onFieldChange,
}: {
  fields: string[]
  onFieldChange: (idx: number, val: string) => void
}) {
  return (
    <div className="grid grid-cols-3 gap-3 sm:grid-cols-6">
      {FIELD_LABELS.map((label, i) => (
        <div key={label} className="grid gap-1">
          <Label className="text-xs">{label}</Label>
          <Input
            value={fields[i] ?? "*"}
            onChange={(e) => onFieldChange(i, e.target.value)}
            className="font-mono text-sm"
          />
          <div className="flex flex-wrap gap-1">
            {FIELD_CHIPS[FIELD_KEYS[i]]?.map((chip) => (
              <Chip
                key={chip.value}
                active={fields[i] === chip.value}
                onClick={() => onFieldChange(i, chip.value)}
              >
                {chip.label}
              </Chip>
            ))}
          </div>
        </div>
      ))}
    </div>
  )
}

// ── Main component ─────────────────────────────────────────────────────────────

interface Props {
  value: string
  onChange: (v: string) => void
}

export function CronBuilder({ value, onChange }: Props) {
  const parsed = parseSimple(value)
  const [mode, setMode] = useState<"simple" | "advanced">(parsed ? "simple" : "advanced")

  const [simple, setSimple] = useState<SimpleState>(
    parsed ?? { type: "minutes", every: 5, hour: 9, minute: 0, dayOfWeek: 1, dayOfMonth: 1 },
  )

  const valueParts = value.trim().split(/\s+/)
  const [fields, setFields] = useState<string[]>(
    valueParts.length === 6 ? valueParts : ["0", "*", "*", "*", "*", "*"],
  )

  function patchSimple(patch: Partial<SimpleState>) {
    const next = { ...simple, ...patch }
    setSimple(next)
    onChange(toExpr(next))
  }

  function patchField(idx: number, val: string) {
    const next = [...fields]
    next[idx] = val
    setFields(next)
    onChange(next.join(" "))
  }

  function switchMode(m: "simple" | "advanced") {
    setMode(m)
    if (m === "simple") {
      const s = parseSimple(value) ?? {
        type: "minutes" as SimpleType,
        every: 5,
        hour: 9,
        minute: 0,
        dayOfWeek: 1,
        dayOfMonth: 1,
      }
      setSimple(s)
      onChange(toExpr(s))
    } else {
      const parts = value.trim().split(/\s+/)
      const f = parts.length === 6 ? parts : ["0", "*", "*", "*", "*", "*"]
      setFields(f)
    }
  }

  return (
    <div className="grid gap-3">
      {/* Mode toggle */}
      <div className="flex items-center gap-1 rounded-md border p-1 w-fit">
        {(["simple", "advanced"] as const).map((m) => (
          <button
            key={m}
            type="button"
            onClick={() => switchMode(m)}
            className={cn(
              "rounded px-3 py-1 text-xs font-medium capitalize transition",
              mode === m
                ? "bg-primary text-primary-foreground shadow-sm"
                : "text-muted-foreground hover:text-foreground",
            )}
          >
            {m}
          </button>
        ))}
      </div>

      {mode === "simple" ? (
        <SimpleBuilder state={simple} onChange={patchSimple} />
      ) : (
        <AdvancedBuilder fields={fields} onFieldChange={patchField} />
      )}

      {/* Expression preview */}
      <div className="flex items-center gap-2 rounded-md bg-muted/50 px-3 py-2 text-xs">
        <code className="font-mono text-foreground">{value}</code>
        <span className="text-muted-foreground">→</span>
        <span className="font-medium text-foreground">{describeExpr(value)}</span>
      </div>
    </div>
  )
}

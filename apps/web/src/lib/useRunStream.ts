// Copyright 2026 The tempo-flow Authors
// SPDX-License-Identifier: Apache-2.0

import { useEffect, useRef } from "react"
import type { RunEvent } from "@tempo-flow/shared-types"
import { getToken } from "./api"

const BASE = (import.meta.env.VITE_API_URL as string | undefined) ?? "/api"

/**
 * Subscribe to live run events via SSE. Pass a specific run id, or "*" for the
 * global stream. EventSource auto-reconnects on transient drops; we just close
 * it on unmount / key change. The callback is held in a ref so changing it does
 * not reopen the connection.
 */
export function useRunStream(key: string | null, onEvent: (event: RunEvent) => void): void {
  const cb = useRef(onEvent)
  cb.current = onEvent

  useEffect(() => {
    if (!key) return
    const token = getToken()
    if (!token) return
    const path = key === "*" ? "runs" : `runs/${encodeURIComponent(key)}`
    const source = new EventSource(`${BASE}/stream/${path}?token=${encodeURIComponent(token)}`)
    source.onmessage = (msg) => {
      try {
        cb.current(JSON.parse(msg.data) as RunEvent)
      } catch {
        // ignore malformed frames
      }
    }
    return () => source.close()
  }, [key])
}

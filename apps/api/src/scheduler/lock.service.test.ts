// Copyright 2026 The tempo-flow Authors
// SPDX-License-Identifier: Apache-2.0

import type { Redis } from "ioredis"
import { describe, expect, it, vi } from "vitest"
import { LockService } from "./lock.service"

describe("LockService", () => {
  it("acquires when SET NX PX returns OK", async () => {
    const set = vi.fn().mockResolvedValue("OK")
    const lock = new LockService({ set } as unknown as Redis)
    expect(await lock.acquire("flow-1", "tok", 2000)).toBe(true)
    // SET key token PX <ttl> NX
    expect(set).toHaveBeenCalledWith(
      expect.stringContaining("lock:flow-1"),
      "tok",
      "PX",
      2000,
      "NX",
    )
  })

  it("fails to acquire when SET returns null (already held)", async () => {
    const set = vi.fn().mockResolvedValue(null)
    const lock = new LockService({ set } as unknown as Redis)
    expect(await lock.acquire("flow-1", "tok", 2000)).toBe(false)
  })

  it("release deletes only when token matches (eval returns 1)", async () => {
    const evalFn = vi.fn().mockResolvedValue(1)
    const lock = new LockService({ eval: evalFn } as unknown as Redis)
    expect(await lock.release("flow-1", "tok")).toBe(true)
  })

  it("withLock skips fn when lock not acquired", async () => {
    const set = vi.fn().mockResolvedValue(null)
    const evalFn = vi.fn().mockResolvedValue(1)
    const lock = new LockService({ set, eval: evalFn } as unknown as Redis)
    const fn = vi.fn()
    const result = await lock.withLock("k", "t", 1000, fn)
    expect(result).toBeUndefined()
    expect(fn).not.toHaveBeenCalled()
  })

  it("withLock runs fn and releases when acquired", async () => {
    const set = vi.fn().mockResolvedValue("OK")
    const evalFn = vi.fn().mockResolvedValue(1)
    const lock = new LockService({ set, eval: evalFn } as unknown as Redis)
    const result = await lock.withLock("k", "t", 1000, async () => "done")
    expect(result).toBe("done")
    expect(evalFn).toHaveBeenCalledOnce() // released
  })
})

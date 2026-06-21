// Copyright 2026 The tempo-flow Authors
// SPDX-License-Identifier: Apache-2.0

import { Inject, Injectable } from "@nestjs/common"
import type { Redis } from "ioredis"
import { REDIS_CLIENT } from "../redis/redis.constants"

/**
 * Redis distributed lock (SET key token NX PX ttl), continuing the fortem
 * `job-lock.handler.ts` pattern. Used to prevent multiple API/worker instances
 * from triggering the same scheduled flow at the same tick.
 */
@Injectable()
export class LockService {
  constructor(@Inject(REDIS_CLIENT) private readonly redis: Redis) {}

  private key(name: string): string {
    const env = process.env.NODE_ENV ?? "development"
    return `${env}:lock:${name}`
  }

  /** Acquire a lock. Returns true if obtained, false if already held. */
  async acquire(name: string, token: string, ttlMs: number): Promise<boolean> {
    const result = await this.redis.set(this.key(name), token, "PX", ttlMs, "NX")
    return result === "OK"
  }

  /**
   * Release a lock only if we still own it (token matches). Uses a Lua script
   * for atomic compare-and-delete so we never delete someone else's lock.
   */
  async release(name: string, token: string): Promise<boolean> {
    const script =
      "if redis.call('get', KEYS[1]) == ARGV[1] then return redis.call('del', KEYS[1]) else return 0 end"
    const deleted = (await this.redis.eval(script, 1, this.key(name), token)) as number
    return deleted === 1
  }

  /** Run `fn` while holding the lock; skip (return undefined) if not acquired. */
  async withLock<T>(
    name: string,
    token: string,
    ttlMs: number,
    fn: () => Promise<T>,
  ): Promise<T | undefined> {
    const ok = await this.acquire(name, token, ttlMs)
    if (!ok) return undefined
    try {
      return await fn()
    } finally {
      await this.release(name, token)
    }
  }
}

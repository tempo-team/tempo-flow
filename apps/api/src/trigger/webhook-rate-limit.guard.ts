// Copyright 2026 The tempo-flow Authors
// SPDX-License-Identifier: Apache-2.0

import {
  type CanActivate,
  type ExecutionContext,
  HttpException,
  HttpStatus,
  Inject,
  Injectable,
} from "@nestjs/common"
import type { Request } from "express"
import type { Redis } from "ioredis"
import { REDIS_CLIENT } from "../redis/redis.constants"

const WINDOW_SECONDS = 60
const MAX_PER_WINDOW = 60

/**
 * Distributed fixed-window rate limit for the public webhook endpoint, keyed by
 * token in Redis so it holds across API instances. Fail-open if Redis errors —
 * a webhook should not break because the limiter is unavailable.
 */
@Injectable()
export class WebhookRateLimitGuard implements CanActivate {
  constructor(@Inject(REDIS_CLIENT) private readonly redis: Redis) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const req = context.switchToHttp().getRequest<Request>()
    const token = req.params.token
    if (!token) return true
    const key = `rl:hook:${token}`
    try {
      const count = await this.redis.incr(key)
      if (count === 1) await this.redis.expire(key, WINDOW_SECONDS)
      if (count > MAX_PER_WINDOW) {
        throw new HttpException("Too many requests", HttpStatus.TOO_MANY_REQUESTS)
      }
    } catch (err) {
      if (err instanceof HttpException) throw err
      return true // fail open on Redis errors
    }
    return true
  }
}

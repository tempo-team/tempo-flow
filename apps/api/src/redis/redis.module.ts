// Copyright 2026 The tempo-flow Authors
// SPDX-License-Identifier: Apache-2.0

import { Global, Module, type OnModuleDestroy } from "@nestjs/common"
import { ConfigService } from "@nestjs/config"
import { Inject } from "@nestjs/common"
import IORedis, { type Redis } from "ioredis"
import { DEFAULT_REDIS_URL, REDIS_CLIENT } from "./redis.constants"

@Global()
@Module({
  providers: [
    {
      provide: REDIS_CLIENT,
      inject: [ConfigService],
      useFactory: (config: ConfigService): Redis => {
        const url = config.get<string>("REDIS_URL") ?? DEFAULT_REDIS_URL
        // maxRetriesPerRequest must be null for BullMQ-shared connections.
        return new IORedis(url, { maxRetriesPerRequest: null, lazyConnect: true })
      },
    },
  ],
  exports: [REDIS_CLIENT],
})
export class RedisModule implements OnModuleDestroy {
  constructor(@Inject(REDIS_CLIENT) private readonly redis: Redis) {}

  async onModuleDestroy(): Promise<void> {
    await this.redis.quit().catch(() => undefined)
  }
}

// Copyright 2026 The tempo-flow Authors
// SPDX-License-Identifier: Apache-2.0

import { Type } from "class-transformer"
import { IsBoolean, IsInt, IsOptional, IsString, ValidateNested } from "class-validator"

class SlackSettings {
  @IsOptional()
  @IsBoolean()
  enabled?: boolean

  @IsOptional()
  @IsString()
  webhookUrl?: string
}

class TelegramSettings {
  @IsOptional()
  @IsBoolean()
  enabled?: boolean

  @IsOptional()
  @IsString()
  botToken?: string

  @IsOptional()
  @IsString()
  chatId?: string
}

class DiscordSettings {
  @IsOptional()
  @IsBoolean()
  enabled?: boolean

  @IsOptional()
  @IsString()
  webhookUrl?: string
}

class EmailSettings {
  @IsOptional()
  @IsBoolean()
  enabled?: boolean

  @IsOptional()
  @IsString()
  host?: string

  @IsOptional()
  @IsInt()
  port?: number

  @IsOptional()
  @IsBoolean()
  secure?: boolean

  @IsOptional()
  @IsString()
  user?: string

  @IsOptional()
  @IsString()
  pass?: string

  @IsOptional()
  @IsString()
  from?: string

  @IsOptional()
  @IsString()
  to?: string
}

class WebhookSettings {
  @IsOptional()
  @IsBoolean()
  enabled?: boolean

  @IsOptional()
  @IsString()
  url?: string

  @IsOptional()
  @IsString()
  secret?: string
}

class EventSettings {
  @IsOptional()
  @IsBoolean()
  failed?: boolean

  @IsOptional()
  @IsBoolean()
  completed?: boolean

  @IsOptional()
  @IsBoolean()
  retryExhausted?: boolean
}

export class UpdateNotificationSettingsRequest {
  @IsOptional()
  @ValidateNested()
  @Type(() => SlackSettings)
  slack?: SlackSettings

  @IsOptional()
  @ValidateNested()
  @Type(() => TelegramSettings)
  telegram?: TelegramSettings

  @IsOptional()
  @ValidateNested()
  @Type(() => DiscordSettings)
  discord?: DiscordSettings

  @IsOptional()
  @ValidateNested()
  @Type(() => EmailSettings)
  email?: EmailSettings

  @IsOptional()
  @ValidateNested()
  @Type(() => WebhookSettings)
  webhook?: WebhookSettings

  @IsOptional()
  @ValidateNested()
  @Type(() => EventSettings)
  events?: EventSettings
}

// Copyright 2026 The tempo-flow Authors
// SPDX-License-Identifier: Apache-2.0

import { Type } from "class-transformer"
import { IsBoolean, IsOptional, IsString, ValidateNested } from "class-validator"

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
  @Type(() => EventSettings)
  events?: EventSettings
}

// Copyright 2026 The tempo-flow Authors
// SPDX-License-Identifier: Apache-2.0

/** A message received from an event source, normalized to a field map. */
export interface EventMessage {
  topic: string
  fields: Record<string, string>
}

export type EventMessageHandler = (message: EventMessage) => void

/**
 * Pluggable source of trigger events. Redis Streams is built in; Kafka /
 * RabbitMQ adapters can be added later by implementing this interface and
 * registering them in EventTriggerService's adapter registry.
 */
export interface EventTriggerAdapter {
  readonly source: string
  /** (Re)start consuming the given topics, invoking `handler` per message. */
  start(topics: string[], handler: EventMessageHandler): Promise<void>
  stop(): Promise<void>
}

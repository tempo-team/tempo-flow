// Copyright 2026 The tempo-flow Authors
// SPDX-License-Identifier: Apache-2.0

import { getNodeAutoInstrumentations } from "@opentelemetry/auto-instrumentations-node"
import { OTLPTraceExporter } from "@opentelemetry/exporter-trace-otlp-http"
import { resourceFromAttributes } from "@opentelemetry/resources"
import { NodeSDK } from "@opentelemetry/sdk-node"
import { ATTR_SERVICE_NAME } from "@opentelemetry/semantic-conventions"

let sdk: NodeSDK | undefined

/**
 * Start OpenTelemetry tracing if an OTLP endpoint is configured. No-op (and zero
 * overhead) when OTEL_EXPORTER_OTLP_ENDPOINT is unset, so default deployments are
 * unaffected. Must run before the rest of the app loads so auto-instrumentation
 * (HTTP, Express, Prisma, ioredis, ...) patches those modules.
 */
export function startTelemetry(): void {
  if (!process.env.OTEL_EXPORTER_OTLP_ENDPOINT || sdk) return
  sdk = new NodeSDK({
    resource: resourceFromAttributes({
      [ATTR_SERVICE_NAME]: process.env.OTEL_SERVICE_NAME ?? "tempo-flow",
    }),
    traceExporter: new OTLPTraceExporter(), // reads OTEL_EXPORTER_OTLP_ENDPOINT
    instrumentations: [getNodeAutoInstrumentations()],
  })
  sdk.start()
}

export async function stopTelemetry(): Promise<void> {
  await sdk?.shutdown().catch(() => undefined)
}

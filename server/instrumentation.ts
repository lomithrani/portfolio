import { Elysia } from 'elysia'
import { opentelemetry } from '@elysiajs/opentelemetry'
import { NodeSDK } from '@opentelemetry/sdk-node'
import { BatchSpanProcessor } from '@opentelemetry/sdk-trace'
import type { SpanExporter } from '@opentelemetry/sdk-trace'
import { PeriodicExportingMetricReader } from '@opentelemetry/sdk-metrics'
import { BatchLogRecordProcessor } from '@opentelemetry/sdk-logs'
import { OTLPTraceExporter } from '@opentelemetry/exporter-trace-otlp-proto'
import { OTLPMetricExporter } from '@opentelemetry/exporter-metrics-otlp-proto'
import { OTLPLogExporter } from '@opentelemetry/exporter-logs-otlp-proto'
import { resourceFromAttributes } from '@opentelemetry/resources'
import { ATTR_SERVICE_NAME } from '@opentelemetry/semantic-conventions'
import { metrics } from '@opentelemetry/api'
import { env } from './env'

// Span attributes the Elysia plugin fills with credentials or personal data:
// every request header (the session cookie is a 7-day JWT), the parsed
// cookies, and request/response bodies (the Google ID token posted to /login,
// user emails). They must never reach the trace backend.
export const SENSITIVE_SPAN_ATTRIBUTES = [
	'http.request.header.cookie',
	'http.request.header.authorization',
	'http.request.cookie',
	'http.request.body',
	'http.response.body',
	'http.response.header.set-cookie'
]

/** Wraps a span exporter so the sensitive attributes are dropped before export */
export const redactingSpanExporter = (exporter: SpanExporter): SpanExporter => ({
	export(spans, resultCallback) {
		for (const span of spans) {
			// Ended spans are not frozen: this deletes from what the exporter reads
			for (const key of SENSITIVE_SPAN_ATTRIBUTES) delete span.attributes[key]
		}
		exporter.export(spans, resultCallback)
	},
	shutdown: () => exporter.shutdown(),
	forceFlush: () => exporter.forceFlush?.() ?? Promise.resolve()
})

// Telemetry is fully off unless OTEL_EXPORTER_OTLP_ENDPOINT is set: no SDK,
// no exporters, and the OpenTelemetry API stays on its no-op providers.
// (Calling the Elysia plugin without an SDK would start its own NodeSDK
// with default OTLP exporters pointed at http://localhost:4318.)
let sdk: NodeSDK | undefined

if (env.otelEnabled) {
	// One SDK owns traces, metrics and logs. Exporters read the endpoint and
	// headers from OTEL_EXPORTER_OTLP_* themselves.
	sdk = new NodeSDK({
		resource: resourceFromAttributes({
			[ATTR_SERVICE_NAME]: env.OTEL_SERVICE_NAME,
			'deployment.environment.name': env.NODE_ENV
		}),
		spanProcessors: [new BatchSpanProcessor({
			exporter: redactingSpanExporter(new OTLPTraceExporter())
		})],
		metricReaders: [new PeriodicExportingMetricReader({
			exporter: new OTLPMetricExporter(),
			exportIntervalMillis: 60_000
		})],
		logRecordProcessors: [new BatchLogRecordProcessor({ exporter: new OTLPLogExporter() })],
		instrumentations: []
	})
	// Must run before the plugin (which then reuses this SDK instead of
	// starting another) and before metrics.getMeter() below
	sdk.start()
}

// Elysia request tracing; a plain no-op plugin when telemetry is off
export const instrumentation = env.otelEnabled
	? opentelemetry({ serviceName: env.OTEL_SERVICE_NAME })
	: new Elysia({ name: 'otel-disabled' })

/** Flushes and stops exporters (no-op when telemetry is off) */
export const shutdownTelemetry = async () => {
	await sdk?.shutdown()
}

// HTTP server metrics (the Elysia plugin only does tracing, not metrics)
const meter = metrics.getMeter('portfolio-server')

export const httpRequestCounter = meter.createCounter('http.server.requests', {
	description: 'Total number of HTTP requests'
})

export const httpRequestDuration = meter.createHistogram('http.server.request.duration', {
	description: 'HTTP request duration in milliseconds',
	unit: 'ms'
})

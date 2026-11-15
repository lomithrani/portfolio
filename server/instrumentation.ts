import { Elysia } from 'elysia'
import { opentelemetry } from '@elysiajs/opentelemetry'
import { NodeSDK } from '@opentelemetry/sdk-node'
import { BatchSpanProcessor } from '@opentelemetry/sdk-trace'
import type { ReadableSpan, SpanExporter, SpanProcessor } from '@opentelemetry/sdk-trace'
import { PeriodicExportingMetricReader } from '@opentelemetry/sdk-metrics'
import type { PushMetricExporter } from '@opentelemetry/sdk-metrics'
import { BatchLogRecordProcessor } from '@opentelemetry/sdk-logs'
import type { LogRecordExporter } from '@opentelemetry/sdk-logs'
import { OTLPTraceExporter } from '@opentelemetry/exporter-trace-otlp-proto'
import { OTLPMetricExporter } from '@opentelemetry/exporter-metrics-otlp-proto'
import { OTLPLogExporter } from '@opentelemetry/exporter-logs-otlp-proto'
import { resourceFromAttributes } from '@opentelemetry/resources'
import { ATTR_SERVICE_NAME } from '@opentelemetry/semantic-conventions'
import { metrics } from '@opentelemetry/api'
import { env } from './env'
import type { ServerEnv } from './env'

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

// Ended spans are not frozen: this deletes from what processors and exporters read
const dropSensitiveAttributes = (span: ReadableSpan) => {
	for (const key of SENSITIVE_SPAN_ATTRIBUTES) delete span.attributes[key]
}

/**
 * Drops the sensitive attributes as each span ends. Placed before the batch
 * processor, so the spans it queues until the next export (seconds, up to
 * 2048 of them) never hold a request body: some are megabytes (a résumé PDF)
 */
export class RedactingSpanProcessor implements SpanProcessor {
	onStart() {}
	onEnd(span: ReadableSpan) {
		dropSensitiveAttributes(span)
	}
	forceFlush() {
		return Promise.resolve()
	}
	shutdown() {
		return Promise.resolve()
	}
}

/** Wraps a span exporter so the sensitive attributes are dropped before export (a second layer) */
export const redactingSpanExporter = (exporter: SpanExporter): SpanExporter => ({
	export(spans, resultCallback) {
		for (const span of spans) dropSensitiveAttributes(span)
		exporter.export(spans, resultCallback)
	},
	shutdown: () => exporter.shutdown(),
	forceFlush: () => exporter.forceFlush?.() ?? Promise.resolve()
})

export type TelemetrySettings = Pick<
	ServerEnv,
	| 'NODE_ENV'
	| 'OTEL_SERVICE_NAME'
	| 'OTEL_EXPORTER_OTLP_ENDPOINT'
	| 'OTEL_SDK_DISABLED'
	| 'otelEnabled'
	| 'otelSignals'
>

/** Builds each signal's exporter; tests swap in in-memory ones */
export interface TelemetryExporters {
	traces: () => SpanExporter
	metrics: () => PushMetricExporter
	logs: () => LogRecordExporter
}

// Read the endpoint and headers from OTEL_EXPORTER_OTLP_* themselves
const otlpExporters: TelemetryExporters = {
	traces: () => new OTLPTraceExporter(),
	metrics: () => new OTLPMetricExporter(),
	logs: () => new OTLPLogExporter()
}

const METRIC_EXPORT_INTERVAL_MS = 60_000

/** The span processors of exported traces, in order: redaction, then batching */
export const createSpanProcessors = (exporter: SpanExporter): SpanProcessor[] => [
	new RedactingSpanProcessor(),
	new BatchSpanProcessor({ exporter: redactingSpanExporter(exporter) })
]

/**
 * The SDK (not started yet) for the signals the environment exports, or
 * undefined when telemetry is off (no endpoint, or OTEL_SDK_DISABLED=true).
 * A switched-off signal gets an empty list, never undefined: for a missing
 * list NodeSDK builds exporters of its own from OTEL_*_EXPORTER and
 * OTEL_EXPORTER_OTLP_PROTOCOL. So OTEL_TRACES_EXPORTER=none leaves no tracer
 * provider, OTEL_METRICS_EXPORTER=none no meter provider (the instruments
 * below are then no-ops), and OTEL_LOGS_EXPORTER=none a logger provider
 * without processors (logger.ts still prints to the console).
 */
export const createTelemetrySdk = (
	settings: TelemetrySettings,
	exporters: TelemetryExporters = otlpExporters
): NodeSDK | undefined => {
	if (!settings.otelEnabled) return undefined
	const signals = settings.otelSignals
	return new NodeSDK({
		resource: resourceFromAttributes({
			[ATTR_SERVICE_NAME]: settings.OTEL_SERVICE_NAME,
			'deployment.environment.name': settings.NODE_ENV
		}),
		spanProcessors: signals.traces ? createSpanProcessors(exporters.traces()) : [],
		metricReaders: signals.metrics
			? [new PeriodicExportingMetricReader({
				exporter: exporters.metrics(),
				exportIntervalMillis: METRIC_EXPORT_INTERVAL_MS
			})]
			: [],
		logRecordProcessors: signals.logs
			? [new BatchLogRecordProcessor({ exporter: exporters.logs() })]
			: [],
		instrumentations: []
	})
}

/**
 * Elysia request tracing; a plain no-op plugin unless traces are exported.
 * Create it after the SDK started: without a registered tracer provider the
 * OpenTelemetry plugin starts a NodeSDK of its own, with default exporters.
 */
export const createTracingPlugin = (settings: TelemetrySettings) =>
	settings.otelSignals.traces
		? opentelemetry({ serviceName: settings.OTEL_SERVICE_NAME })
		: new Elysia({ name: 'otel-disabled' })

/** One-line summary of what is exported, for the startup log */
export const describeTelemetry = (settings: TelemetrySettings): string => {
	if (settings.OTEL_EXPORTER_OTLP_ENDPOINT === undefined) return 'off (no OTEL_EXPORTER_OTLP_ENDPOINT)'
	if (settings.OTEL_SDK_DISABLED) return 'off (OTEL_SDK_DISABLED=true)'
	const signals = settings.otelSignals
	const state = (exported: boolean) => (exported ? 'otlp' : 'none')
	return `traces=${state(signals.traces)} metrics=${state(signals.metrics)} logs=${state(signals.logs)}`
}

const sdk = createTelemetrySdk(env)
// Must run before the plugin (which then reuses this SDK instead of starting
// another) and before metrics.getMeter() below
sdk?.start()

export const instrumentation = createTracingPlugin(env)

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

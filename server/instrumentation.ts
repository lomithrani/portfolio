import { opentelemetry } from '@elysiajs/opentelemetry'
import { BatchSpanProcessor } from '@opentelemetry/sdk-trace-node'
import { PeriodicExportingMetricReader } from '@opentelemetry/sdk-metrics'
import {
	LoggerProvider,
	BatchLogRecordProcessor
} from '@opentelemetry/sdk-logs'
import { OTLPTraceExporter } from '@opentelemetry/exporter-trace-otlp-proto'
import { OTLPMetricExporter } from '@opentelemetry/exporter-metrics-otlp-proto'
import { OTLPLogExporter } from '@opentelemetry/exporter-logs-otlp-proto'
import { resourceFromAttributes } from '@opentelemetry/resources'
import {
	ATTR_SERVICE_NAME,
	SEMRESATTRS_DEPLOYMENT_ENVIRONMENT
} from '@opentelemetry/semantic-conventions'
import { logs } from '@opentelemetry/api-logs'
import { metrics } from '@opentelemetry/api'

const isEnabled = !!process.env.OTEL_EXPORTER_OTLP_ENDPOINT

const resource = resourceFromAttributes({
	[ATTR_SERVICE_NAME]: process.env.OTEL_SERVICE_NAME ?? 'portfolio-server',
	[SEMRESATTRS_DEPLOYMENT_ENVIRONMENT]: process.env.NODE_ENV ?? 'development'
})

// Set up LoggerProvider (the Elysia plugin doesn't handle logs)
if (isEnabled) {
	const loggerProvider = new LoggerProvider({
		resource,
		processors: [new BatchLogRecordProcessor(new OTLPLogExporter())]
	})
	logs.setGlobalLoggerProvider(loggerProvider)
}

// Elysia plugin — no-ops internally when no exporters are configured
export const instrumentation = isEnabled
	? opentelemetry({
			serviceName: process.env.OTEL_SERVICE_NAME ?? 'portfolio-server',
			resource,
			spanProcessors: [new BatchSpanProcessor(new OTLPTraceExporter())],
			metricReader: new PeriodicExportingMetricReader({
				exporter: new OTLPMetricExporter(),
				exportIntervalMillis: 60_000
			}),
			instrumentations: []
		})
	: opentelemetry({ instrumentations: [] })

// HTTP server metrics (the Elysia plugin only does tracing, not metrics)
const meter = metrics.getMeter('portfolio-server')

export const httpRequestCounter = meter.createCounter('http.server.requests', {
	description: 'Total number of HTTP requests'
})

export const httpRequestDuration = meter.createHistogram('http.server.request.duration', {
	description: 'HTTP request duration in milliseconds',
	unit: 'ms'
})

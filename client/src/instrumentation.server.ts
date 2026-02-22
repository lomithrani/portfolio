import dotenv from 'dotenv'

// Vite dev server's SSR sandbox doesn't populate process.env from .env files.
// The OTLP exporters read from process.env internally, so we must load them manually.
// Only in dev — production sets real env vars on the process.
if (!process.env.OTEL_EXPORTER_OTLP_ENDPOINT) {
	dotenv.config()
}

import { NodeSDK } from '@opentelemetry/sdk-node'
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

const isEnabled = !!process.env.OTEL_EXPORTER_OTLP_ENDPOINT

if (isEnabled) {
	const resource = resourceFromAttributes({
		[ATTR_SERVICE_NAME]: process.env.OTEL_SERVICE_NAME ?? 'portfolio-client',
		[SEMRESATTRS_DEPLOYMENT_ENVIRONMENT]: process.env.NODE_ENV ?? 'development'
	})

	// LoggerProvider (separate from NodeSDK)
	const loggerProvider = new LoggerProvider({
		resource,
		processors: [new BatchLogRecordProcessor(new OTLPLogExporter())]
	})
	logs.setGlobalLoggerProvider(loggerProvider)

	const sdk = new NodeSDK({
		resource,
		spanProcessors: [new BatchSpanProcessor(new OTLPTraceExporter())],
		metricReader: new PeriodicExportingMetricReader({
			exporter: new OTLPMetricExporter(),
			exportIntervalMillis: 60_000
		}),
		instrumentations: []
	})

	sdk.start()

	const shutdown = async () => {
		await sdk.shutdown()
		await loggerProvider.shutdown()
	}

	process.on('SIGTERM', shutdown)
	process.on('SIGINT', shutdown)
	process.on('sveltekit:shutdown', shutdown)
}

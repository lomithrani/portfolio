import dotenv from 'dotenv';

// Vite's dev server does not copy .env into process.env, but the OTLP exporters read their
// configuration (OTEL_EXPORTER_OTLP_*) from process.env, so load it here outside production.
// Production (Railway) sets real environment variables on the process.
if (process.env.NODE_ENV !== 'production' && !process.env.OTEL_EXPORTER_OTLP_ENDPOINT) {
	dotenv.config({ quiet: true });
}

// Telemetry is fully off unless an OTLP endpoint is configured: no SDK, no exporter, no
// timers (SvelteKit's own spans then go to the no-op tracer of @opentelemetry/api).
if (process.env.OTEL_EXPORTER_OTLP_ENDPOINT) {
	const [
		{ NodeSDK },
		{ BatchSpanProcessor },
		{ PeriodicExportingMetricReader },
		{ LoggerProvider, BatchLogRecordProcessor },
		{ OTLPTraceExporter },
		{ OTLPMetricExporter },
		{ OTLPLogExporter },
		{ resourceFromAttributes },
		{ ATTR_SERVICE_NAME },
		{ logs }
	] = await Promise.all([
		import('@opentelemetry/sdk-node'),
		import('@opentelemetry/sdk-trace'),
		import('@opentelemetry/sdk-metrics'),
		import('@opentelemetry/sdk-logs'),
		import('@opentelemetry/exporter-trace-otlp-proto'),
		import('@opentelemetry/exporter-metrics-otlp-proto'),
		import('@opentelemetry/exporter-logs-otlp-proto'),
		import('@opentelemetry/resources'),
		import('@opentelemetry/semantic-conventions'),
		import('@opentelemetry/api-logs')
	]);

	const resource = resourceFromAttributes({
		[ATTR_SERVICE_NAME]: process.env.OTEL_SERVICE_NAME ?? 'portfolio-client',
		// Stable semconv name (replaces the deprecated deployment.environment)
		'deployment.environment.name': process.env.NODE_ENV ?? 'development'
	});

	// LoggerProvider (separate from NodeSDK)
	const loggerProvider = new LoggerProvider({
		resource,
		processors: [new BatchLogRecordProcessor({ exporter: new OTLPLogExporter() })]
	});
	logs.setGlobalLoggerProvider(loggerProvider);

	const sdk = new NodeSDK({
		resource,
		spanProcessors: [new BatchSpanProcessor({ exporter: new OTLPTraceExporter() })],
		metricReaders: [
			new PeriodicExportingMetricReader({
				exporter: new OTLPMetricExporter(),
				exportIntervalMillis: 60_000
			})
		],
		instrumentations: []
	});

	sdk.start();

	// Flush pending telemetry once. adapter-bun owns SIGTERM/SIGINT: it drains the HTTP server,
	// then emits 'sveltekit:shutdown'. Registering signal listeners here as well would run the
	// shutdown twice and keep the process alive when no other listener exits it.
	let shuttingDown: Promise<unknown> | undefined;
	const shutdown = () =>
		(shuttingDown ??= Promise.allSettled([sdk.shutdown(), loggerProvider.shutdown()]));

	process.once('sveltekit:shutdown', shutdown);
}

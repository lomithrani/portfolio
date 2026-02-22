import { logs, SeverityNumber } from '@opentelemetry/api-logs'
import { trace, context } from '@opentelemetry/api'

type LogAttributes = Record<string, string | number | boolean | undefined>

const emit = (
	severityNumber: SeverityNumber,
	severityText: string,
	message: string,
	attributes?: LogAttributes
) => {
	const activeSpan = trace.getSpan(context.active())
	const spanContext = activeSpan?.spanContext()

	const logger = logs.getLoggerProvider().getLogger('portfolio-api')
	logger.emit({
		severityNumber,
		severityText,
		body: message,
		attributes: {
			...attributes,
			...(spanContext && {
				trace_id: spanContext.traceId,
				span_id: spanContext.spanId
			})
		}
	})

	// Also output to console for local dev visibility
	const consoleFn =
		severityNumber >= SeverityNumber.ERROR
			? console.error
			: severityNumber >= SeverityNumber.WARN
				? console.warn
				: console.log

	const prefix = `[${severityText}]`
	if (attributes && Object.keys(attributes).length > 0) {
		consoleFn(prefix, message, attributes)
	} else {
		consoleFn(prefix, message)
	}
}

export const logger = {
	debug: (message: string, attributes?: LogAttributes) =>
		emit(SeverityNumber.DEBUG, 'DEBUG', message, attributes),
	info: (message: string, attributes?: LogAttributes) =>
		emit(SeverityNumber.INFO, 'INFO', message, attributes),
	warn: (message: string, attributes?: LogAttributes) =>
		emit(SeverityNumber.WARN, 'WARN', message, attributes),
	error: (message: string, attributes?: LogAttributes) =>
		emit(SeverityNumber.ERROR, 'ERROR', message, attributes)
}

import { getNodeAutoInstrumentations } from '@opentelemetry/auto-instrumentations-node'
import { OTLPTraceExporter } from '@opentelemetry/exporter-trace-otlp-http'
import { resourceFromAttributes } from '@opentelemetry/resources'
import { NodeSDK } from '@opentelemetry/sdk-node'
import { ATTR_SERVICE_NAME } from '@opentelemetry/semantic-conventions'

const traceExporter = new OTLPTraceExporter({
	url: 'http://jaeger:4318/v1/traces'
})

export const otelSdk = new NodeSDK({
	traceExporter,
	resource: resourceFromAttributes({
		[ATTR_SERVICE_NAME]: 'communities-service'
	}),

	instrumentations: [
		getNodeAutoInstrumentations({
			'@opentelemetry/instrumentation-grpc': { enabled: true },
			'@opentelemetry/instrumentation-http': { enabled: true },
			'@opentelemetry/instrumentation-nestjs-core': {
				enabled: true
			},
			'@opentelemetry/instrumentation-pg': { enabled: true }
		})
	]
})

otelSdk.start()

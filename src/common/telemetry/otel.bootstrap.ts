import { NodeSDK } from '@opentelemetry/sdk-node';
import { OTLPTraceExporter } from '@opentelemetry/exporter-trace-otlp-http';
import { BatchSpanProcessor } from '@opentelemetry/sdk-trace-base';

let sdk: NodeSDK | null = null;

export function bootstrapOpenTelemetry(): void {
  const enabled = process.env.OTEL_ENABLED === 'true';

  if (!enabled || process.env.NODE_ENV === 'test') {
    return;
  }

  const serviceName = process.env.OTEL_SERVICE_NAME ?? 'template-saas-export-service';
  const endpoint = process.env.OTEL_EXPORTER_OTLP_ENDPOINT ?? 'http://localhost:4318/v1/traces';

  if (sdk) {
    return;
  }

  const exporter = new OTLPTraceExporter({
    url: endpoint,
    headers: {},
    timeoutMillis: 10000,
  });

  sdk = new NodeSDK({
    serviceName,
    traceExporter: exporter,
    spanProcessors: [new BatchSpanProcessor(exporter)],
    resourceDetectors: [],
    instrumentations: [],
  });

  try {
    sdk.start();
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : String(error);
    console.warn(`[otel] failed to start exporter: ${message}`);
  }
}

export function shutdownOpenTelemetry(): void {
  if (!sdk) {
    return;
  }

  void sdk.shutdown();
  sdk = null;
}

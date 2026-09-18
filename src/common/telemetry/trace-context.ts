import { context, trace, type SpanContext } from '@opentelemetry/api';

export function getSpanContextFromActiveContext(): SpanContext | undefined {
  return trace.getSpanContext(context.active());
}

export function enrichWithTraceContext<T extends Record<string, unknown>>(
  payload: T,
  spanContext?: SpanContext,
): T {
  const resolvedContext = spanContext ?? getSpanContextFromActiveContext();

  if (!resolvedContext?.traceId && !resolvedContext?.spanId) {
    return payload;
  }

  return {
    ...payload,
    ...(resolvedContext.traceId ? { traceId: resolvedContext.traceId } : {}),
    ...(resolvedContext.spanId ? { spanId: resolvedContext.spanId } : {}),
  };
}

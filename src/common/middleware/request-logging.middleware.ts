import { Injectable, NestMiddleware } from '@nestjs/common';
import { context, propagation, SpanKind, SpanStatusCode, trace } from '@opentelemetry/api';
import { randomUUID } from 'crypto';
import { NextFunction, Request, Response } from 'express';
import { Logger } from 'nestjs-pino';

@Injectable()
export class RequestLoggingMiddleware implements NestMiddleware {
  constructor(private readonly logger: Logger) {}

  use(req: Request, res: Response, next: NextFunction): void {
    const startedAt = Date.now();
    const requestId = (req.headers['x-request-id'] as string | undefined) || randomUUID();
    req.headers['x-request-id'] = requestId;
    res.setHeader('x-request-id', requestId);

    const tracer = trace.getTracer('template-saas-export-service.http');
    const activeContext = propagation.extract(context.active(), req.headers as Record<string, string>);
    const httpTarget = req.originalUrl ?? req.url ?? '';
    const span = tracer.startSpan(`${req.method} ${httpTarget || 'request'}`, {
      kind: SpanKind.SERVER,
      attributes: {
        'http.method': req.method,
        'http.target': httpTarget,
        'http.route': req.route?.path ?? httpTarget,
        'http.request_id': requestId,
      },
    });
    const spanContext = span.spanContext();
    const contextWithSpan = trace.setSpan(activeContext, span);

    res.on('finish', () => {
      const duration = Date.now() - startedAt;
      const statusCode = res.statusCode;

      span.setAttributes({
        'http.status_code': statusCode,
        'http.duration_ms': duration,
      });
      span.setStatus({
        code: statusCode >= 500 ? SpanStatusCode.ERROR : SpanStatusCode.OK,
        message: statusCode >= 500 ? 'HTTP error' : 'OK',
      });
      span.end();

      this.logger.log(
        {
          traceId: spanContext.traceId,
          spanId: spanContext.spanId,
          method: req.method,
          path: req.originalUrl,
          statusCode,
          duration,
          requestId,
        },
        'request.completed',
      );
    });

    context.with(contextWithSpan, () => next());
  }
}

import {
  ConflictException,
  Inject,
  Injectable,
  NotFoundException,
  Optional,
  ServiceUnavailableException,
} from '@nestjs/common';
import { InjectQueue } from '@nestjs/bullmq';
import { ConfigService } from '@nestjs/config';
import { SpanKind, SpanStatusCode, trace } from '@opentelemetry/api';
import { JobsOptions, Queue } from 'bullmq';
import { existsSync } from 'fs';
import { Logger } from 'nestjs-pino';
import { enrichWithTraceContext } from '../common/telemetry/trace-context';
import { QueueHealthService } from '../queue/queue-health.service';
import { CreateExportDto } from './dto/create-export.dto';
import { ExportEntity } from './export.entity';
import { IExportRepository } from './interfaces/export.repository.interface';
import { EXPORT_REPOSITORY } from './export.tokens';
@Injectable()
export class ExportService {
  private readonly queueName = 'pdf-export';

  constructor(
    @Inject(EXPORT_REPOSITORY) private readonly repository: IExportRepository,
    @InjectQueue('pdf-export') private readonly exportQueue: Queue,
    private readonly configService: ConfigService,
    private readonly logger: Logger,
    @Optional() private readonly queueHealthService?: QueueHealthService,  ) {}

  private getExportJobOptions(): JobsOptions {
    return {
      attempts: this.configService.get<number>('queue.exportJob.attempts', 3),
      backoff: {
        type: this.configService.get<'fixed' | 'exponential'>('queue.exportJob.backoffType', 'exponential'),
        delay: this.configService.get<number>('queue.exportJob.backoffDelayMs', 5000),
      },
      removeOnComplete: {
        count: this.configService.get<number>('queue.exportJob.removeOnCompleteCount', 1000),
      },
      removeOnFail: this.configService.get<boolean>('queue.exportJob.removeOnFail', false),
    };
  }

  private async assertQueueSubmissionReady(): Promise<void> {
    const mockMode = this.configService.get<boolean>('app.mockMode', false);
    if (mockMode) {
      return;
    }

    const queueEnabled = this.configService.get<boolean>('queue.enabled', true);
    if (!queueEnabled) {
      throw new ServiceUnavailableException('Export queue is disabled');
    }

    if (this.queueHealthService) {
      const readiness = await this.queueHealthService.checkReadiness();
      if (readiness.required && !readiness.healthy) {
        throw new ServiceUnavailableException(readiness.reason ?? 'Export queue is unavailable');
      }
      return;
    }

    try {
      await this.exportQueue.waitUntilReady();
    } catch {
      throw new ServiceUnavailableException('Export queue is unavailable');
    }
  }

  async createJob(payload: CreateExportDto, userId: string, requestId?: string): Promise<ExportEntity> {
    const tracer = trace.getTracer('template-saas-export-service.export.service');

    return tracer.startActiveSpan('service.export.createJob', { kind: SpanKind.INTERNAL }, async (span) => {
      span.setAttributes({
        'app.operation': 'export.createJob',
        'user.id': userId,
        'request.id': requestId ?? '',
      });

      try {
        this.logger.warn({ payload, userId, requestId }, 'export.createJob.start');

        let created: ExportEntity;
        try {
          created = await this.repository.createWithOutbox(payload, userId, requestId);
          this.logger.warn({ exportId: created.id, userId, requestId }, 'export.createJob.repository.success');
        } catch (error) {
          this.logger.error({ err: error, payload, userId, requestId }, 'export.createJob.repository.failed');
          throw error;
        }

        this.logger.log(
          enrichWithTraceContext({
            module: 'outbox',
            operation: 'export.created',
            queue: this.queueName,
            exportId: created.id,
            userId,
            requestId,
          }),
          'outbox.event.recorded',
        );

        span.setStatus({ code: SpanStatusCode.OK });
        return created;
      } catch (error) {
        span.recordException(error as Error);
        span.setStatus({
          code: SpanStatusCode.ERROR,
          message: error instanceof Error ? error.message : 'Create export job failed',
        });
        throw error;
      } finally {
        span.end();
      }
    });
  }

  async findJobStatus(id: string, userId: string): Promise<ExportEntity | null> {
    const tracer = trace.getTracer('template-saas-export-service.export.service');

    return tracer.startActiveSpan('service.export.findJobStatus', { kind: SpanKind.INTERNAL }, async (span) => {
      span.setAttributes({
        'app.operation': 'export.findJobStatus',
        'export.job.id': id,
        'user.id': userId,
      });

      try {
        const result = await this.repository.findById(id, userId);
        span.setStatus({ code: SpanStatusCode.OK });
        return result;
      } catch (error) {
        span.recordException(error as Error);
        span.setStatus({
          code: SpanStatusCode.ERROR,
          message: error instanceof Error ? error.message : 'Find export job status failed',
        });
        throw error;
      } finally {
        span.end();
      }
    });
  }

  async findJobStatusOrThrow(id: string, userId: string): Promise<ExportEntity> {
    const exportJob = await this.findJobStatus(id, userId);
    if (!exportJob) {
      throw new NotFoundException('Export job not found');
    }

    return exportJob;
  }

  async resolveDownloadableJobOrThrow(id: string, userId: string): Promise<ExportEntity> {
    const tracer = trace.getTracer('template-saas-export-service.export.service');

    return tracer.startActiveSpan('service.export.resolveDownloadableJobOrThrow', { kind: SpanKind.INTERNAL }, async (span) => {
      span.setAttributes({
        'app.operation': 'export.resolveDownloadableJobOrThrow',
        'export.job.id': id,
        'user.id': userId,
      });

      try {
        const exportJob = await this.findJobStatusOrThrow(id, userId);

        const validationSpan = tracer.startSpan('service.export.download.validation', { kind: SpanKind.INTERNAL });
        if (exportJob.status !== 'completed' || !exportJob.downloadPath) {
          validationSpan.recordException(new ConflictException('Export job is not completed yet'));
          validationSpan.setStatus({ code: SpanStatusCode.ERROR, message: 'Export job not completed' });
          validationSpan.end();
          throw new ConflictException('Export job is not completed yet');
        }

        if (!existsSync(exportJob.downloadPath)) {
          validationSpan.recordException(new ConflictException('Export file has not been generated yet'));
          validationSpan.setStatus({ code: SpanStatusCode.ERROR, message: 'Export file missing' });
          validationSpan.end();
          throw new ConflictException('Export file has not been generated yet');
        }
        validationSpan.setStatus({ code: SpanStatusCode.OK });
        validationSpan.end();

        span.setStatus({ code: SpanStatusCode.OK });
        return exportJob;
      } catch (error) {
        span.recordException(error as Error);
        span.setStatus({
          code: SpanStatusCode.ERROR,
          message: error instanceof Error ? error.message : 'Resolve downloadable job failed',
        });
        throw error;
      } finally {
        span.end();
      }
    });
  }
}

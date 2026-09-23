import { InjectQueue } from '@nestjs/bullmq';
import { Injectable } from '@nestjs/common';
import { Queue } from 'bullmq';
import { Logger } from 'nestjs-pino';
import { OutboxEventEntity, OutboxStatus, OUTBOX_EVENT_TYPES } from './outbox-event.entity';
import { OutboxRepository } from './outbox.repository.prisma';

@Injectable()
export class OutboxDispatcherService {
  private readonly queueName = 'pdf-export';

  constructor(
    private readonly outboxRepository: OutboxRepository,
    @InjectQueue('pdf-export') private readonly exportQueue: Queue,
    private readonly logger: Logger,
  ) {}

  async dispatchPending(limit = 50): Promise<number> {
    const pending = await this.outboxRepository.findPending(limit);
    if (pending.length === 0) {
      return 0;
    }

    let dispatched = 0;

    for (const event of pending) {
      const wasPublished = await this.dispatchEvent(event);
      if (wasPublished) {
        dispatched += 1;
      }
    }

    return dispatched;
  }

  private isDuplicateJobError(error: unknown, exportId: string): boolean {
    if (!(error instanceof Error)) {
      return false;
    }

    const message = error.message.toLowerCase();
    return (
      message.includes('already exists') ||
      message.includes(`job with id \"${exportId}\" already exists`) ||
      message.includes(`job with id '${exportId}' already exists`)
    );
  }

  private async dispatchEvent(event: OutboxEventEntity): Promise<boolean> {
    try {
      await this.outboxRepository.markPublishing(event.id);

      if (event.eventType === OUTBOX_EVENT_TYPES.EXPORT_JOB_CREATED) {
        const payload = event.payload as Record<string, unknown>;
        const exportId = event.aggregateId;

        const existingJob = await this.exportQueue.getJob(exportId);
        if (existingJob) {
          const state = await existingJob.getState();
          if (state === 'waiting' || state === 'active' || state === 'completed' || state === 'failed' || state === 'delayed') {
            this.logger.log(
              {
                module: 'outbox',
                operation: 'dispatch.skip_duplicate',
                eventId: event.id,
                aggregateId: exportId,
                eventType: event.eventType,
                jobState: state,
              },
              'outbox.dispatch.skip_duplicate',
            );
            await this.outboxRepository.markPublished(event.id);
            return true;
          }
        }

        try {
          await this.exportQueue.add(
            this.queueName,
            {
              exportId,
              requestId: payload.requestId as string | undefined,
            },
            {
              jobId: exportId,
              attempts: 3,
              backoff: {
                type: 'exponential',
                delay: 5000,
              },
            },
          );
        } catch (error) {
          if (this.isDuplicateJobError(error, exportId)) {
            this.logger.log(
              {
                module: 'outbox',
                operation: 'dispatch.skip_duplicate_add',
                eventId: event.id,
                aggregateId: exportId,
                eventType: event.eventType,
              },
              'outbox.dispatch.skip_duplicate_add',
            );
            await this.outboxRepository.markPublished(event.id);
            return true;
          }

          throw error;
        }
      }

      await this.outboxRepository.markPublished(event.id);
      this.logger.log(
        {
          module: 'outbox',
          operation: 'dispatch.success',
          eventId: event.id,
          aggregateId: event.aggregateId,
          eventType: event.eventType,
        },
        'outbox.dispatch.success',
      );
      return true;
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Outbox dispatch failed';
      await this.outboxRepository.markFailed(event.id, message);
      this.logger.error(
        {
          module: 'outbox',
          operation: 'dispatch.failed',
          eventId: event.id,
          aggregateId: event.aggregateId,
          eventType: event.eventType,
          err: error,
        },
        'outbox.dispatch.failed',
      );
      return false;
    }
  }
}

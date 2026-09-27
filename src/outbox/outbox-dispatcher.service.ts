import { InjectQueue } from '@nestjs/bullmq';
import { Injectable } from '@nestjs/common';
import { Queue } from 'bullmq';
import { Logger } from 'nestjs-pino';
import { OutboxEventEntity, OutboxStatus, OUTBOX_EVENT_TYPES } from './outbox-event.entity';
import { OutboxRepository } from './outbox.repository.prisma';

@Injectable()
export class OutboxDispatcherService {
  private readonly queueName = 'pdf-export';
  private readonly maxDispatchAttempts = Number(process.env.OUTBOX_MAX_RETRY_ATTEMPTS ?? 3);
  private readonly metrics = {
    scanned: 0,
    dispatched: 0,
    published: 0,
    duplicate: 0,
    failed: 0,
    deadLettered: 0,
    stale_recovered: 0,
    claim_skipped: 0,
    claim_count: 0,
    claim_conflict_count: 0,
  };

  constructor(
    private readonly outboxRepository: OutboxRepository,
    @InjectQueue('pdf-export') private readonly exportQueue: Queue,
    private readonly logger: Logger,
  ) {}

  async dispatchPending(limit = 50): Promise<number> {
    const recovered = await this.outboxRepository.recoverStalePublishing(30_000);
    this.metrics.stale_recovered += recovered;
    if (recovered > 0) {
      this.logger.warn(
        {
          module: 'outbox',
          operation: 'dispatch.recover_stale_publishing',
          recovered,
        },
        'outbox.dispatch.recover_stale_publishing',
      );
    }

    const pending = await this.outboxRepository.claimPendingBatch(limit, this.maxDispatchAttempts, 30_000);
    this.metrics.claim_count += pending.length;
    this.metrics.scanned += pending.length;

    if (pending.length === 0) {
      this.metrics.claim_skipped += 1;
      this.metrics.claim_conflict_count += 1;
      this.logger.log(
        {
          module: 'outbox',
          operation: 'dispatch.scan',
          scanned: this.metrics.scanned,
          claimed: 0,
          claimSkipped: this.metrics.claim_skipped,
          claimConflictCount: this.metrics.claim_conflict_count,
        },
        'outbox.dispatch.scan',
      );
      return 0;
    }

    this.logger.log(
      {
        module: 'outbox',
        operation: 'dispatch.claim_batch',
        claimed: pending.length,
        claimCount: this.metrics.claim_count,
        staleRecovered: this.metrics.stale_recovered,
      },
      'outbox.dispatch.claim_batch',
    );

    let dispatched = 0;

    for (const event of pending) {
      this.logger.log(
        {
          module: 'outbox',
          operation: 'dispatch.pickup',
          eventId: event.id,
          aggregateId: event.aggregateId,
          eventType: event.eventType,
          attempts: event.attempts,
        },
        'outbox.dispatch.pickup',
      );

      const wasPublished = await this.dispatchEvent(event);
      if (wasPublished) {
        dispatched += 1;
      }
    }

    this.metrics.dispatched += dispatched;
    this.logger.log(
      {
        module: 'outbox',
        operation: 'dispatch.batch_summary',
        scanned: pending.length,
        dispatched,
        metrics: { ...this.metrics },
      },
      'outbox.dispatch.batch_summary',
    );

    return dispatched;
  }

  getMetricsSnapshot(): Readonly<typeof this.metrics> {
    return { ...this.metrics };
  }

  private recordLifecycle(event: 'published' | 'duplicate' | 'failed' | 'dead_lettered'): void {
    if (event === 'published') {
      this.metrics.published += 1;
      return;
    }

    if (event === 'duplicate') {
      this.metrics.duplicate += 1;
      return;
    }

    if (event === 'dead_lettered') {
      this.metrics.deadLettered += 1;
      return;
    }

    this.metrics.failed += 1;
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
    let attemptsAfterPublish = event.attempts + 1;

    try {
      let publishingState: OutboxEventEntity | null = null;
      if (event.status !== OutboxStatus.PUBLISHING) {
        publishingState = await this.outboxRepository.markPublishing(event.id);
        attemptsAfterPublish = Number(publishingState?.attempts ?? attemptsAfterPublish);
      } else {
        attemptsAfterPublish = Number(event.attempts ?? attemptsAfterPublish);
      }

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
            this.recordLifecycle('duplicate');
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
            this.recordLifecycle('duplicate');
            await this.outboxRepository.markPublished(event.id);
            return true;
          }

          throw error;
        }
      }

      await this.outboxRepository.markPublished(event.id);
      this.recordLifecycle('published');
      this.logger.log(
        {
          module: 'outbox',
          operation: 'dispatch.success',
          eventId: event.id,
          aggregateId: event.aggregateId,
          eventType: event.eventType,
          metrics: { ...this.metrics },
        },
        'outbox.dispatch.success',
      );
      return true;
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Outbox dispatch failed';

      if (attemptsAfterPublish >= this.maxDispatchAttempts) {
        this.recordLifecycle('dead_lettered');
        await this.outboxRepository.markDeadLettered(event.id, message);
        this.logger.error(
          {
            module: 'outbox',
            operation: 'dispatch.dead_lettered',
            eventId: event.id,
            aggregateId: event.aggregateId,
            eventType: event.eventType,
            attempts: attemptsAfterPublish,
            err: error,
            metrics: { ...this.metrics },
          },
          'outbox.dispatch.dead_lettered',
        );
        return false;
      }

      this.recordLifecycle('failed');
      await this.outboxRepository.markFailed(event.id, message);
      this.logger.error(
        {
          module: 'outbox',
          operation: 'dispatch.failed',
          eventId: event.id,
          aggregateId: event.aggregateId,
          eventType: event.eventType,
          attempts: attemptsAfterPublish,
          err: error,
          metrics: { ...this.metrics },
        },
        'outbox.dispatch.failed',
      );
      return false;
    }
  }
}

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

  private static readonly DISPATCH_LOG_PREFIX = 'outbox.dispatch';

  constructor(
    private readonly outboxRepository: OutboxRepository,
    @InjectQueue('pdf-export') private readonly exportQueue: Queue,
    private readonly logger: Logger,
  ) {}

  async dispatchPending(limit = 50): Promise<number> {
    await this.recoverStaleRows();
    const claimedEvents = await this.claimRows(limit);
    this.metrics.scanned += claimedEvents.length;

    if (claimedEvents.length === 0) {
      this.recordClaimSkipped();
      return 0;
    }

    this.logClaimBatch(claimedEvents.length);

    let dispatched = 0;
    for (const event of claimedEvents) {
      this.logEventPickup(event);

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
        scanned: claimedEvents.length,
        dispatched,
        metrics: { ...this.metrics },
      },
      `${OutboxDispatcherService.DISPATCH_LOG_PREFIX}.batch_summary`,
    );

    return dispatched;
  }

  getMetricsSnapshot(): Readonly<typeof this.metrics> {
    return { ...this.metrics };
  }

  private async recoverStaleRows(): Promise<number> {
    const recovered = await this.outboxRepository.recoverStalePublishing(30_000);
    this.metrics.stale_recovered += recovered;

    if (recovered > 0) {
      this.logger.warn(
        {
          module: 'outbox',
          operation: 'dispatch.recover_stale_publishing',
          recovered,
        },
        `${OutboxDispatcherService.DISPATCH_LOG_PREFIX}.recover_stale_publishing`,
      );
    }

    return recovered;
  }

  private async claimRows(limit: number): Promise<OutboxEventEntity[]> {
    const claimed = await this.outboxRepository.claimPendingBatch(limit, this.maxDispatchAttempts);
    this.metrics.claim_count += claimed.length;
    return claimed;
  }

  private recordClaimSkipped(): void {
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
      `${OutboxDispatcherService.DISPATCH_LOG_PREFIX}.scan`,
    );
  }

  private logClaimBatch(claimedCount: number): void {
    this.logger.log(
      {
        module: 'outbox',
        operation: 'dispatch.claim_batch',
        claimed: claimedCount,
        claimCount: this.metrics.claim_count,
        staleRecovered: this.metrics.stale_recovered,
      },
      `${OutboxDispatcherService.DISPATCH_LOG_PREFIX}.claim_batch`,
    );
  }

  private logEventPickup(event: OutboxEventEntity): void {
    this.logger.log(
      {
        module: 'outbox',
        operation: 'dispatch.pickup',
        eventId: event.id,
        aggregateId: event.aggregateId,
        eventType: event.eventType,
        attempts: event.attempts,
      },
      `${OutboxDispatcherService.DISPATCH_LOG_PREFIX}.pickup`,
    );
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
    const attemptsAfterClaim = await this.claimEventForDispatch(event);

    try {
      const isDuplicate = await this.handleExistingDuplicateJob(event);
      if (isDuplicate) {
        return true;
      }

      await this.enqueueExportJob(event);
      await this.markPublished(event);
      return true;
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Outbox dispatch failed';

      if (attemptsAfterClaim >= this.maxDispatchAttempts) {
        await this.markDeadLettered(event, message, error);
        return false;
      }

      await this.markFailed(event, message, error);
      return false;
    }
  }

  private async claimEventForDispatch(event: OutboxEventEntity): Promise<number> {
    if (event.status === OutboxStatus.PUBLISHING) {
      return Number(event.attempts ?? event.attempts + 1);
    }

    const publishingState = await this.outboxRepository.markPublishing(event.id);
    return Number(publishingState?.attempts ?? event.attempts + 1);
  }

  private async markPublished(event: OutboxEventEntity): Promise<void> {
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
      `${OutboxDispatcherService.DISPATCH_LOG_PREFIX}.success`,
    );
  }

  private async markFailed(event: OutboxEventEntity, message: string, error: unknown): Promise<void> {
    this.recordLifecycle('failed');
    await this.outboxRepository.markFailed(event.id, message);
    this.logger.error(
      {
        module: 'outbox',
        operation: 'dispatch.failed',
        eventId: event.id,
        aggregateId: event.aggregateId,
        eventType: event.eventType,
        attempts: event.attempts + 1,
        err: error,
        metrics: { ...this.metrics },
      },
      `${OutboxDispatcherService.DISPATCH_LOG_PREFIX}.failed`,
    );
  }

  private async markDeadLettered(event: OutboxEventEntity, message: string, error: unknown): Promise<void> {
    this.recordLifecycle('dead_lettered');
    await this.outboxRepository.markDeadLettered(event.id, message);
    this.logger.error(
      {
        module: 'outbox',
        operation: 'dispatch.dead_lettered',
        eventId: event.id,
        aggregateId: event.aggregateId,
        eventType: event.eventType,
        attempts: event.attempts + 1,
        err: error,
        metrics: { ...this.metrics },
      },
      `${OutboxDispatcherService.DISPATCH_LOG_PREFIX}.dead_lettered`,
    );
  }

  private async handleExistingDuplicateJob(event: OutboxEventEntity): Promise<boolean> {
    if (event.eventType !== OUTBOX_EVENT_TYPES.EXPORT_JOB_CREATED) {
      return false;
    }

    const payload = event.payload as Record<string, unknown>;
    const exportId = event.aggregateId;
    const existingJob = await this.exportQueue.getJob(exportId);
    if (!existingJob) {
      return false;
    }

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
        `${OutboxDispatcherService.DISPATCH_LOG_PREFIX}.skip_duplicate`,
      );
      await this.markDuplicateAsPublished(event);
      return true;
    }

    return false;
  }

  private async markDuplicateAsPublished(event: OutboxEventEntity): Promise<void> {
    this.recordLifecycle('duplicate');
    await this.outboxRepository.markPublished(event.id);
  }

  private async enqueueExportJob(event: OutboxEventEntity): Promise<void> {
    if (event.eventType !== OUTBOX_EVENT_TYPES.EXPORT_JOB_CREATED) {
      return;
    }

    const payload = event.payload as Record<string, unknown>;
    const exportId = event.aggregateId;

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
          `${OutboxDispatcherService.DISPATCH_LOG_PREFIX}.skip_duplicate_add`,
        );
        await this.markDuplicateAsPublished(event);
        return;
      }

      throw error;
    }
  }
}

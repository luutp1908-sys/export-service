import { describe, expect, it, jest } from '@jest/globals';
import { OutboxDispatcherService } from './outbox-dispatcher.service';
import { OutboxEventEntity, OutboxStatus, OUTBOX_EVENT_TYPES } from './outbox-event.entity';

describe('OutboxDispatcherService', () => {
  const buildEvent = (): OutboxEventEntity => ({
    id: 'event-1',
    aggregateType: 'export',
    aggregateId: 'export-123',
    eventType: OUTBOX_EVENT_TYPES.EXPORT_JOB_CREATED,
    status: OutboxStatus.PENDING,
    attempts: 0,
    payload: {
      requestId: 'req-123',
      userId: 'user-123',
      format: 'pdf',
    },
    createdAt: new Date('2026-01-01T00:00:00.000Z'),
    updatedAt: new Date('2026-01-01T00:00:00.000Z'),
  });

  it('marks the outbox event as published when the queue job already exists', async () => {
    const outboxRepository: any = {
      findPending: jest.fn(),
      markPublishing: jest.fn(async () => ({})),
      markPublished: jest.fn(async () => ({})),
      markFailed: jest.fn(async () => ({})),
    };

    const queueJob: any = {
      getState: jest.fn(async () => 'waiting'),
    };

    const exportQueue: any = {
      getJob: jest.fn(async () => queueJob),
      add: jest.fn(),
    };

    const logger: any = { log: jest.fn(), error: jest.fn() };
    const service = new OutboxDispatcherService(outboxRepository, exportQueue, logger);

    const event = buildEvent();
    const result = await (service as any).dispatchEvent(event);

    expect(result).toBe(true);
    expect(exportQueue.add).not.toHaveBeenCalled();
    expect(outboxRepository.markPublished).toHaveBeenCalledWith(event.id);
    expect(outboxRepository.markFailed).not.toHaveBeenCalled();
  });

  it('dead-letters an event when the retry limit is exceeded', async () => {
    const outboxRepository: any = {
      findPending: jest.fn(),
      markPublishing: jest.fn(async () => ({ ...buildEvent(), attempts: 3 })),
      markPublished: jest.fn(async () => ({})),
      markFailed: jest.fn(async () => ({})),
      markDeadLettered: jest.fn(async () => ({})),
    };

    const exportQueue: any = {
      getJob: jest.fn(async () => null),
      add: jest.fn(async () => {
        throw new Error('Redis unavailable');
      }),
    };

    const logger: any = { log: jest.fn(), error: jest.fn() };
    const service = new OutboxDispatcherService(outboxRepository, exportQueue, logger);

    const event = { ...buildEvent(), attempts: 3 };
    const result = await (service as any).dispatchEvent(event);

    expect(result).toBe(false);
    expect(outboxRepository.markDeadLettered).toHaveBeenCalledWith(event.id, expect.stringContaining('Redis unavailable'));
    expect(outboxRepository.markFailed).not.toHaveBeenCalled();
  });
});

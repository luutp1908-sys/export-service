jest.mock('bullmq', () => {
  const queueInstance = {
    waitUntilReady: jest.fn().mockResolvedValue(undefined),
    getJobCounts: jest.fn().mockResolvedValue({
      waiting: 0,
      active: 0,
      completed: 0,
      failed: 0,
      delayed: 0,
    }),
    close: jest.fn().mockResolvedValue(undefined),
  };

  return {
    Queue: jest.fn(() => queueInstance),
  };
});

import { ConfigService } from '@nestjs/config';
import { QueueHealthService } from './queue-health.service';
import { WorkerHealthRegistry } from './worker-health.registry';

describe('QueueHealthService', () => {
  it('allows job creation when Redis is reachable but worker heartbeat has not started yet', async () => {
    const configService = {
      get: jest.fn((key: string, fallback?: unknown) => {
        const values: Record<string, unknown> = {
          'app.mockMode': false,
          'queue.enabled': true,
          'redis.host': 'localhost',
          'redis.port': 6379,
          'redis.password': '',
          'redis.tls': false,
        };

        return values[key] ?? fallback;
      }),
    } as unknown as ConfigService;

    const registry = {
      snapshot: jest.fn().mockReturnValue([]),
    } as unknown as WorkerHealthRegistry;

    const service = new QueueHealthService(configService, registry);

    const readiness = await service.checkReadiness();

    expect(readiness.required).toBe(false);
    expect(readiness.healthy).toBe(true);
    expect(readiness.status).toBe('skipped');
  });
});

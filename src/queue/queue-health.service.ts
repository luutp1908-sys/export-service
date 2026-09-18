import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Queue } from 'bullmq';
import { WorkerHealthRegistry, WorkerHeartbeatSnapshot } from './worker-health.registry';

export interface QueueReadinessCheck {
  required: boolean;
  enabled: boolean;
  healthy: boolean;
  status: 'ok' | 'skipped' | 'degraded';
  reason?: string;
  details?: {
    queueName: string;
    jobCounts: Record<string, number>;
    workers: WorkerHeartbeatSnapshot[];
    staleAfterMs: number;
  };
}

@Injectable()
export class QueueHealthService {
  private readonly queueName = 'pdf-export';

  constructor(
    private readonly configService: ConfigService,
    private readonly workerHealthRegistry: WorkerHealthRegistry,
  ) {}

  async checkReadiness(): Promise<QueueReadinessCheck> {
    const mockMode = this.configService.get<boolean>('app.mockMode', false);
    const enabled = this.configService.get<boolean>('queue.enabled', true);

    if (mockMode) {
      return {
        required: false,
        enabled,
        healthy: true,
        status: 'skipped',
        reason: 'Mock mode enabled',
      };
    }

    if (!enabled) {
      return {
        required: false,
        enabled,
        healthy: true,
        status: 'skipped',
        reason: 'Queue disabled by configuration',
      };
    }

    const host = this.configService.get<string>('redis.host', 'localhost');
    const port = this.configService.get<number>('redis.port', 6379);
    const password = this.configService.get<string>('redis.password') || undefined;
    const tls = this.configService.get<boolean>('redis.tls', false);
    const staleAfterMs = 90_000;

    let queue: Queue | null = null;
    try {
      queue = new Queue(this.queueName, {
        connection: {
          host,
          port,
          password,
          tls: tls ? {} : undefined,
        },
      });

      await queue.waitUntilReady();
      const jobCounts = await queue.getJobCounts('waiting', 'active', 'completed', 'failed', 'delayed');
      const workers = this.workerHealthRegistry.snapshot(staleAfterMs);
      const workersHealthy = workers.length > 0 && workers.every((worker) => worker.healthy);

      return {
        required: true,
        enabled,
        healthy: workersHealthy,
        status: workersHealthy ? 'ok' : 'degraded',
        reason: workersHealthy ? undefined : 'No healthy queue worker heartbeat',
        details: {
          queueName: this.queueName,
          jobCounts,
          workers,
          staleAfterMs,
        },
      };
    } catch (error) {
      return {
        required: true,
        enabled,
        healthy: false,
        status: 'degraded',
        reason: error instanceof Error ? error.message : 'Queue connectivity check failed',
      };
    } finally {
      if (queue) {
        await queue.close().catch(() => undefined);
      }
    }
  }
}

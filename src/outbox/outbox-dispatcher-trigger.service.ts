import { Injectable, LoggerService, OnModuleDestroy, OnModuleInit } from '@nestjs/common';
import { Logger } from 'nestjs-pino';
import { OutboxDispatcherService } from './outbox-dispatcher.service';

@Injectable()
export class OutboxDispatcherTriggerService implements OnModuleInit, OnModuleDestroy {
  private readonly intervalMs = Number(process.env.OUTBOX_DISPATCH_INTERVAL_MS ?? 5000);
  private intervalHandle?: NodeJS.Timeout;

  constructor(
    private readonly dispatcher: OutboxDispatcherService,
    private readonly logger: Logger,
  ) {}

  onModuleInit(): void {
    if (process.env.MOCK_MODE === 'true') {
      return;
    }

    void this.dispatcher.dispatchPending(50);

    this.intervalHandle = setInterval(() => {
      void this.dispatcher.dispatchPending(50).catch((error: unknown) => {
        const message = error instanceof Error ? error.message : 'Outbox dispatch tick failed';
        this.logger.error(
          {
            module: 'outbox',
            operation: 'dispatch.tick_failed',
            error: message,
          },
          'outbox.dispatch.tick_failed',
        );
      });
    }, this.intervalMs);
  }

  onModuleDestroy(): void {
    if (this.intervalHandle) {
      clearInterval(this.intervalHandle);
      this.intervalHandle = undefined;
    }
  }
}

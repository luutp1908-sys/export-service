import { describe, expect, it, jest, beforeEach, afterEach } from '@jest/globals';
import { OutboxDispatcherTriggerService } from './outbox-dispatcher-trigger.service';

describe('OutboxDispatcherTriggerService', () => {
  const originalMockMode = process.env.MOCK_MODE;
  const originalInterval = process.env.OUTBOX_DISPATCH_INTERVAL_MS;

  beforeEach(() => {
    delete process.env.MOCK_MODE;
    delete process.env.OUTBOX_DISPATCH_INTERVAL_MS;
    jest.useFakeTimers();
  });

  afterEach(() => {
    jest.useRealTimers();
    if (originalMockMode === undefined) {
      delete process.env.MOCK_MODE;
    } else {
      process.env.MOCK_MODE = originalMockMode;
    }

    if (originalInterval === undefined) {
      delete process.env.OUTBOX_DISPATCH_INTERVAL_MS;
    } else {
      process.env.OUTBOX_DISPATCH_INTERVAL_MS = originalInterval;
    }
  });

  it('dispatches pending outbox events on startup and on interval', async () => {
    const dispatcher: any = {
      dispatchPending: jest.fn<() => Promise<number>>().mockResolvedValue(1),
    };

    const logger: any = {
      log: jest.fn(),
      error: jest.fn(),
    };

    const service = new OutboxDispatcherTriggerService(dispatcher as any, logger as any);
    service.onModuleInit();

    await Promise.resolve();

    expect(dispatcher.dispatchPending).toHaveBeenCalledWith(50);
    expect(dispatcher.dispatchPending).toHaveBeenCalledTimes(1);

    jest.advanceTimersByTime(5000);
    await Promise.resolve();

    expect(dispatcher.dispatchPending).toHaveBeenCalledTimes(2);
    service.onModuleDestroy();
  });
});

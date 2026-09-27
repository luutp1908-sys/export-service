import { Module } from '@nestjs/common';
import { BullModule, getQueueToken } from '@nestjs/bullmq';
import { LoggerModule } from 'nestjs-pino';
import { ExportController } from './export.controller';
import { ExportProcessor } from './export.processor';
import { ExportService } from './export.service';
import { EXPORT_REPOSITORY } from './export.tokens';
import { QueueHealthService } from '../queue/queue-health.service';
import { WorkerHealthRegistry } from '../queue/worker-health.registry';
import { OutboxDispatcherService } from '../outbox/outbox-dispatcher.service';
import { OutboxDispatcherTriggerService } from '../outbox/outbox-dispatcher-trigger.service';
import { OutboxRepository } from '../outbox/outbox.repository.prisma';
const impl = process.env.MOCK_MODE === 'true' || process.env.MOCK_MODE === '1'
  ? require('./export.repository.mock')
  : require('./export.repository.prisma');
const isMock = process.env.MOCK_MODE === 'true' || process.env.MOCK_MODE === '1';

const queueImports = isMock ? [] : [BullModule.registerQueue({ name: 'pdf-export' })];
const queueProviders = isMock
  ? [{ provide: getQueueToken('pdf-export'), useValue: { add: async () => undefined } }]
  : [ExportProcessor, QueueHealthService, WorkerHealthRegistry];
@Module({
  imports: [
    LoggerModule.forRoot(),
    ...queueImports,
  ],
  controllers: [ExportController],
  providers: [
    ExportService,
    OutboxRepository,
    OutboxDispatcherService,
    OutboxDispatcherTriggerService,
    ...queueProviders,
    { provide: EXPORT_REPOSITORY, useClass: impl.ExportRepository },
  ],
  exports: [ExportService, OutboxDispatcherService, OutboxDispatcherTriggerService],
})
export class ExportModule {}

import { Injectable } from '@nestjs/common';
import { PrismaService } from '../database/prisma.service';
import { OutboxEventEntity, OutboxEventType, OutboxStatus } from './outbox-event.entity';

@Injectable()
export class OutboxRepository {
  constructor(private readonly prisma: PrismaService) {}

  async create(
    aggregateId: string,
    eventType: OutboxEventType,
    payload: Record<string, unknown>,
    options?: {
      aggregateType?: 'export';
      status?: OutboxStatus;
    },
  ): Promise<OutboxEventEntity> {
    const record = await (this.prisma as any).outboxEvent.create({
      data: {
        aggregateType: options?.aggregateType ?? 'export',
        aggregateId,
        eventType,
        status: options?.status ?? OutboxStatus.PENDING,
        attempts: 0,
        payload,
      },
    });

    return record as OutboxEventEntity;
  }

  async findPending(limit = 50, maxAttempts = 5): Promise<OutboxEventEntity[]> {
    const rows = await (this.prisma as any).outboxEvent.findMany({
      where: {
        OR: [
          { status: OutboxStatus.PENDING },
          {
            status: OutboxStatus.FAILED,
            attempts: { lt: maxAttempts },
          },
        ],
      },
      orderBy: {
        createdAt: 'asc',
      },
      take: limit,
    });

    return rows as OutboxEventEntity[];
  }

  async markPublishing(id: string): Promise<OutboxEventEntity | null> {
    const row = await (this.prisma as any).outboxEvent.update({
      where: { id },
      data: {
        status: OutboxStatus.PUBLISHING,
        attempts: { increment: 1 },
      },
    });

    return row as OutboxEventEntity | null;
  }

  async markPublished(id: string): Promise<OutboxEventEntity | null> {
    const row = await (this.prisma as any).outboxEvent.update({
      where: { id },
      data: {
        status: OutboxStatus.PUBLISHED,
        publishedAt: new Date(),
        errorMessage: null,
      },
    });

    return row as OutboxEventEntity | null;
  }

  async markFailed(id: string, errorMessage: string): Promise<OutboxEventEntity | null> {
    const row = await (this.prisma as any).outboxEvent.update({
      where: { id },
      data: {
        status: OutboxStatus.FAILED,
        errorMessage,
      },
    });

    return row as OutboxEventEntity | null;
  }

  async markDeadLettered(id: string, errorMessage: string): Promise<OutboxEventEntity | null> {
    const row = await (this.prisma as any).outboxEvent.update({
      where: { id },
      data: {
        status: OutboxStatus.DEAD_LETTERED,
        errorMessage,
      },
    });

    return row as OutboxEventEntity | null;
  }
}

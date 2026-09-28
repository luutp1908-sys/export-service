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

  async recoverStalePublishing(maxAgeMs = 30_000): Promise<number> {
    const staleBefore = new Date(Date.now() - maxAgeMs);
    const result = await (this.prisma as any).outboxEvent.updateMany({
      where: {
        status: OutboxStatus.PUBLISHING,
        updatedAt: { lt: staleBefore },
      },
      data: {
        status: OutboxStatus.PENDING,
        errorMessage: null,
      },
    });

    return Number(result?.count ?? 0);
  }

  async findPending(limit = 50, maxAttempts = 5, stalePublishingMaxAgeMs = 30_000): Promise<OutboxEventEntity[]> {
    const staleBefore = new Date(Date.now() - stalePublishingMaxAgeMs);
    const rows = await (this.prisma as any).outboxEvent.findMany({
      where: {
        OR: [
          { status: OutboxStatus.PENDING },
          {
            status: OutboxStatus.FAILED,
            attempts: { lt: maxAttempts },
          },
          {
            status: OutboxStatus.PUBLISHING,
            updatedAt: { lt: staleBefore },
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

  async claimPendingBatch(limit = 50, maxAttempts = 5): Promise<OutboxEventEntity[]> {
    const rows = await (this.prisma as any).$queryRawUnsafe(
      `
        WITH claimed AS (
          SELECT id
          FROM "OutboxEvent"
          WHERE status = $1
             OR (status = $2 AND attempts < $3)
          ORDER BY "createdAt" ASC
          LIMIT $4
          FOR UPDATE SKIP LOCKED
        )
        UPDATE "OutboxEvent" AS e
        SET status = $5,
            attempts = e.attempts + 1,
            "errorMessage" = NULL,
            "updatedAt" = NOW()
        FROM claimed
        WHERE e.id = claimed.id
        RETURNING e.*;
      `,
      OutboxStatus.PENDING,
      OutboxStatus.FAILED,
      maxAttempts,
      limit,
      OutboxStatus.PUBLISHING,
    );

    return (rows ?? []) as OutboxEventEntity[];
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

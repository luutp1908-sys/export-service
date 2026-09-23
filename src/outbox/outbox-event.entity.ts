export enum OutboxStatus {
  PENDING = 'pending',
  PUBLISHING = 'publishing',
  PUBLISHED = 'published',
  FAILED = 'failed',
  DEAD_LETTERED = 'dead_lettered',
}

export const OUTBOX_EVENT_TYPES = {
  EXPORT_JOB_CREATED: 'export.job.created',
} as const;

export type OutboxEventType = (typeof OUTBOX_EVENT_TYPES)[keyof typeof OUTBOX_EVENT_TYPES];

export interface ExportJobCreatedOutboxPayload {
  requestId?: string;
  userId: string;
  format: string;
  templateName?: string;
  workspaceId?: string;
  draftId?: string;
  templateId?: string;
}

export class OutboxEventEntity {
  id!: string;
  aggregateType!: 'export';
  aggregateId!: string;
  eventType!: OutboxEventType;
  status!: OutboxStatus;
  attempts!: number;
  payload!: Record<string, unknown> | ExportJobCreatedOutboxPayload;
  createdAt!: Date;
  publishedAt?: Date;
  updatedAt!: Date;
  errorMessage?: string;
}

import { ExportContentDto, ExportFormat } from './dto/create-export.dto';

export enum ExportStatus {
  PENDING = 'pending',
  PROCESSING = 'processing',
  COMPLETED = 'completed',
  FAILED = 'failed',
}

export class ExportEntity {
  id!: string;
  requestedByUserId!: string;
  format!: ExportFormat;
  status!: ExportStatus;
  fileName!: string;
  content!: ExportContentDto;
  draftId?: string;
  templateId?: string;
  workspaceId?: string;
  downloadPath?: string;
  errorMessage?: string;
  attemptCount?: number;
  completedAt?: Date;
  createdAt!: Date;
  updatedAt!: Date;
}

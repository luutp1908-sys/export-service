import { ExportEntity } from './export.entity';
import { ExportFormat } from './dto/create-export.dto';
import { ExportStatus } from './export.entity';

export class ExportMapper {
  static toEntity(partial: Partial<ExportEntity>): ExportEntity {
    return {
      id: partial.id ?? '',
      requestedByUserId: partial.requestedByUserId ?? '',
      format: partial.format ?? ExportFormat.PDF,
      status: partial.status ?? ExportStatus.PENDING,
      fileName: partial.fileName ?? 'template.pdf',
      content: partial.content ?? { pages: [] },
      draftId: partial.draftId,
      templateId: partial.templateId,
      workspaceId: partial.workspaceId,
      downloadPath: partial.downloadPath,
      errorMessage: partial.errorMessage,
      completedAt: partial.completedAt,
      createdAt: partial.createdAt ?? new Date(),
      updatedAt: partial.updatedAt ?? new Date(),
    };
  }
}

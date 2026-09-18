import { BadRequestException, Injectable } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { PrismaService } from '../database/prisma.service';
import { CreateExportDto } from './dto/create-export.dto';
import { ExportEntity, ExportStatus } from './export.entity';

@Injectable()
export class ExportRepository {
  constructor(private readonly prisma: PrismaService) {}

  private toPdfFileName(templateName?: string): string {
    const base = (templateName ?? 'template')
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, '-')
      .replace(/^-+|-+$/g, '')
      .slice(0, 120);

    return `${base || 'template'}.pdf`;
  }

  async create(payload: CreateExportDto, userId: string): Promise<ExportEntity> {
    if (payload.workspaceId) {
      const workspace = await (this.prisma as any).workspace.findUnique({
        where: { id: payload.workspaceId },
      });

      if (!workspace) {
        throw new BadRequestException(`Invalid workspaceId: ${payload.workspaceId}`);
      }
    }

    if (payload.templateId) {
      const template = await (this.prisma as any).template.findUnique({
        where: { id: payload.templateId },
      });

      if (!template) {
        throw new BadRequestException(`Invalid templateId: ${payload.templateId}`);
      }
    }

    const exportJob = await (this.prisma as any).export.create({
      data: {
        requestedByUserId: userId,
        workspaceId: payload.workspaceId ?? null,
        draftId: payload.draftId ?? null,
        templateId: payload.templateId ?? null,
        format: payload.format,
        status: ExportStatus.PENDING,
        fileName: this.toPdfFileName(payload.templateName),
        content: payload.content as unknown as Prisma.InputJsonValue,
      },
    });

    return exportJob as unknown as ExportEntity;
  }

  async findById(id: string, userId?: string): Promise<ExportEntity | null> {
    const exportJob = await (this.prisma as any).export.findFirst({
      where: userId ? { id, requestedByUserId: userId } : { id },
    });

    return (exportJob as ExportEntity | null) ?? null;
  }

  async updateStatus(
    id: string,
    status: string,
    data: Partial<ExportEntity> = {},
    expectedCurrentStatuses: string[] = [],
  ): Promise<ExportEntity | null> {
    const updateResult = await (this.prisma as any).export.updateMany({
      where: {
        id,
        ...(expectedCurrentStatuses.length > 0 ? { status: { in: expectedCurrentStatuses } } : {}),
      },
      data: {
        status,
        ...(data.downloadPath !== undefined ? { downloadPath: data.downloadPath } : {}),
        ...(data.fileName !== undefined ? { fileName: data.fileName } : {}),
        ...(data.errorMessage !== undefined ? { errorMessage: data.errorMessage } : {}),
        ...(data.attemptCount !== undefined ? { attemptCount: data.attemptCount } : {}),
        ...(data.completedAt !== undefined ? { completedAt: data.completedAt } : {}),
      },
    });

    if (updateResult.count === 0) {
      return null;
    }

    const exportJob = await (this.prisma as any).export.findUnique({
      where: { id },
    });

    return exportJob as unknown as ExportEntity;  }
}

import {
  Body,
  Controller,
  Get,
  Header,
  Param,
  ParseUUIDPipe,
  Post,
  Req,
  Res,
  UseGuards,
} from '@nestjs/common';
import {
  ApiBearerAuth,
  ApiConflictResponse,
  ApiNotFoundResponse,
  ApiOkResponse,
  ApiOperation,
  ApiTags,
} from '@nestjs/swagger';
import { SpanKind, SpanStatusCode, trace } from '@opentelemetry/api';
import { Request, Response } from 'express';
import { CurrentUser } from '../auth/decorators/current-user.decorator';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { AuthUser } from '../auth/types/auth-user.type';
import { CreateExportDto } from './dto/create-export.dto';
import { ExportEntity } from './export.entity';
import { ExportService } from './export.service';

@ApiTags('export')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard)
@Controller({ path: 'export', version: '1' })
export class ExportController {
  constructor(private readonly service: ExportService) {}

  @Post('jobs')
  @ApiOperation({ summary: 'Create an async export job' })
  @ApiOkResponse({ type: Object })
  @ApiNotFoundResponse({ description: 'Workspace or template not found.' })
  async createJob(
    @Body() payload: CreateExportDto,
    @CurrentUser() user: AuthUser,
    @Req() req: Request,
  ): Promise<ExportEntity> {
    const requestId = (req.headers['x-request-id'] as string | undefined) ?? undefined;
    const tracer = trace.getTracer('template-saas-export-service.export.controller');

    return tracer.startActiveSpan('controller.export.createJob', { kind: SpanKind.INTERNAL }, async (span) => {
      span.setAttributes({
        'app.operation': 'export.createJob',
        'user.id': user.id,
        'request.id': requestId ?? '',
      });

      try {
        const result = await this.service.createJob(payload, user.id, requestId);
        span.setStatus({ code: SpanStatusCode.OK });
        return result;
      } catch (error) {
        span.recordException(error as Error);
        span.setStatus({
          code: SpanStatusCode.ERROR,
          message: error instanceof Error ? error.message : 'Create export job failed',
        });
        throw error;
      } finally {
        span.end();
      }
    });
  }

  @Get('jobs/:id')
  @ApiOperation({ summary: 'Get export job status' })
  @ApiOkResponse({ type: Object })
  @ApiNotFoundResponse({ description: 'Export job not found.' })
  async findJobStatus(
    @Param('id', new ParseUUIDPipe()) id: string,
    @CurrentUser() user: AuthUser,
  ): Promise<ExportEntity> {
    const tracer = trace.getTracer('template-saas-export-service.export.controller');

    return tracer.startActiveSpan('controller.export.findJobStatus', { kind: SpanKind.INTERNAL }, async (span) => {
      span.setAttributes({
        'app.operation': 'export.findJobStatus',
        'export.job.id': id,
        'user.id': user.id,
      });

      try {
        const result = await this.service.findJobStatusOrThrow(id, user.id);
        span.setStatus({ code: SpanStatusCode.OK });
        return result;
      } catch (error) {
        span.recordException(error as Error);
        span.setStatus({
          code: SpanStatusCode.ERROR,
          message: error instanceof Error ? error.message : 'Find export job status failed',
        });
        throw error;
      } finally {
        span.end();
      }
    });
  }

  @Get('jobs/:id/download')
  @ApiOperation({ summary: 'Download generated export file when completed' })
  @ApiOkResponse({ type: Object })
  @ApiNotFoundResponse({ description: 'Export job not found.' })
  @ApiConflictResponse({ description: 'Export job is not completed yet.' })
  @Header('Content-Type', 'application/pdf')
  async download(
    @Param('id', new ParseUUIDPipe()) id: string,
    @CurrentUser() user: AuthUser,
    @Res() res: Response,
  ): Promise<void> {
    const tracer = trace.getTracer('template-saas-export-service.export.controller');

    await tracer.startActiveSpan('controller.export.download', { kind: SpanKind.INTERNAL }, async (span) => {
      span.setAttributes({
        'app.operation': 'export.download',
        'export.job.id': id,
        'user.id': user.id,
      });

      try {
        const exportJob = await this.service.resolveDownloadableJobOrThrow(id, user.id);

        res.setHeader('Content-Disposition', `attachment; filename="${exportJob.fileName}"`);
        res.sendFile(exportJob.downloadPath!);
        span.setStatus({ code: SpanStatusCode.OK });
      } catch (error) {
        span.recordException(error as Error);
        span.setStatus({
          code: SpanStatusCode.ERROR,
          message: error instanceof Error ? error.message : 'Export download failed',
        });
        throw error;
      } finally {
        span.end();
      }
    });
  }
}

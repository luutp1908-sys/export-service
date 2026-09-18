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
    return this.service.createJob(payload, user.id, requestId);
  }

  @Get('jobs/:id')
  @ApiOperation({ summary: 'Get export job status' })
  @ApiOkResponse({ type: Object })
  @ApiNotFoundResponse({ description: 'Export job not found.' })
  async findJobStatus(
    @Param('id', new ParseUUIDPipe()) id: string,
    @CurrentUser() user: AuthUser,
  ): Promise<ExportEntity> {
    return this.service.findJobStatusOrThrow(id, user.id);
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
    const exportJob = await this.service.resolveDownloadableJobOrThrow(id, user.id);

    res.setHeader('Content-Disposition', `attachment; filename="${exportJob.fileName}"`);
    res.sendFile(exportJob.downloadPath!);
  }
}

import { Type } from 'class-transformer';
import {
  IsArray,
  IsEnum,
  IsObject,
  IsOptional,
  IsString,
  IsUUID,
  MaxLength,
  ValidateNested,
} from 'class-validator';

export enum ExportFormat {
  PDF = 'pdf',
}

export class ExportContentDto {
  @IsArray()
  pages!: unknown[];

  @IsOptional()
  @IsObject()
  meta?: Record<string, unknown>;
}

export class CreateExportDto {
  @IsEnum(ExportFormat)
  format!: ExportFormat;

  @ValidateNested()
  @Type(() => ExportContentDto)
  content!: ExportContentDto;

  @IsOptional()
  @IsUUID()
  draftId?: string;

  @IsOptional()
  @IsUUID()
  templateId?: string;

  @IsOptional()
  @IsUUID()
  workspaceId?: string;

  @IsString()
  @IsOptional()
  @MaxLength(240)
  templateName?: string;
}

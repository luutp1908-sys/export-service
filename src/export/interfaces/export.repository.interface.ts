import { CreateExportDto } from '../dto/create-export.dto';
import { ExportEntity } from '../export.entity';

export interface IExportRepository {
  create(_payload: CreateExportDto, _userId: string): Promise<ExportEntity>;
  createWithOutbox(_payload: CreateExportDto, _userId: string, _requestId?: string): Promise<ExportEntity>;
  findById(_id: string, _userId?: string): Promise<ExportEntity | null>;
  updateStatus(
    _id: string,
    _status: string,
    _data?: Partial<ExportEntity>,
    _expectedCurrentStatuses?: string[],
  ): Promise<ExportEntity | null>;
}

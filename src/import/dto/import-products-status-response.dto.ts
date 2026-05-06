import { ImportJobStatus } from '../entities/import.entity';

export class ImportProductsStatusResponseDto {
  status: ImportJobStatus;
  totalRows: number;
  successRows: number;
  failedRows: number;
  progressPercentage: number;
}

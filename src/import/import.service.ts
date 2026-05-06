import {
  BadRequestException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { InjectQueue } from '@nestjs/bullmq';
import { InjectRepository } from '@nestjs/typeorm';
import { Queue } from 'bullmq';
import { Repository } from 'typeorm';
import { S3Service } from 'src/libs/s3/s3.service';
import { ImportJob, ImportJobStatus } from './entities/import.entity';
import { ProductImportJobPayload } from './interfaces/import-job.interface';
import { ImportProductsStatusResponseDto } from './dto/import-products-status-response.dto';

@Injectable()
export class ImportService {
  constructor(
    @InjectRepository(ImportJob)
    private importJobRepo: Repository<ImportJob>,
    private s3Service: S3Service,
    @InjectQueue('product-import')
    private productImportQueue: Queue<ProductImportJobPayload>,
  ) {}

  async queueProductsCsvImport(file: Express.Multer.File, userId: string) {
    if (!file) {
      throw new BadRequestException('CSV file is required');
    }
    if (!userId) {
      throw new BadRequestException('User id is required');
    }

    const isCsvMime =
      file.mimetype === 'text/csv' ||
      file.mimetype === 'application/vnd.ms-excel';
    const hasCsvExtension = file.originalname.toLowerCase().endsWith('.csv');

    if (!isCsvMime && !hasCsvExtension) {
      throw new BadRequestException('Only CSV files are allowed');
    }

    const uploaded = await this.s3Service.uploadFile(file, 'imports/products');

    const job = this.importJobRepo.create({
      userId,
      fileKey: uploaded.key,
      status: ImportJobStatus.QUEUED,
    });

    const savedJob = await this.importJobRepo.save(job);
    const queuePayload: ProductImportJobPayload = {
      importJobId: savedJob.id,
      fileKey: savedJob.fileKey,
      userId: savedJob.userId,
    };

    await this.productImportQueue.add('product-import', queuePayload);

    return {
      id: savedJob.id,
      status: savedJob.status,
      fileKey: savedJob.fileKey,
      fileUrl: uploaded.url,
      createdAt: savedJob.createdAt,
    };
  }

  async getProductsImportStatus(
    importJobId: string,
    userId: string,
  ): Promise<ImportProductsStatusResponseDto> {
    const importJob = await this.importJobRepo.findOne({
      where: { id: importJobId },
      select: ['id', 'userId', 'status', 'totalRows', 'successRows', 'failedRows'],
    });

    if (!importJob) {
      throw new NotFoundException('Import job not found');
    }

    if (importJob.userId !== userId) {
      throw new ForbiddenException('You can only view your own import job status');
    }

    const processedRows = importJob.successRows + importJob.failedRows;
    const progressPercentage =
      importJob.totalRows > 0
        ? Math.min(100, Math.round((processedRows / importJob.totalRows) * 100))
        : importJob.status === ImportJobStatus.QUEUED
          ? 0
          : 100;

    return {
      status: importJob.status,
      totalRows: importJob.totalRows,
      successRows: importJob.successRows,
      failedRows: importJob.failedRows,
      progressPercentage,
    };
  }
}

import { Processor, WorkerHost } from '@nestjs/bullmq';
import { Job } from 'bullmq';
import {
  ImportFailureRow,
  ProductImportJobPayload,
} from '../interfaces/import-job.interface';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { ImportJob, ImportJobStatus } from '../entities/import.entity';
import { ImportCsvParserService } from '../import-csv-parser.service';
import { InternalServerErrorException, NotFoundException } from '@nestjs/common';
import { User } from 'src/user/entities/user.entity';
import { ImportUpsertService } from '../import-upsert.service';
import { ImportReporterService } from '../import-reporter.service';

@Processor('product-import')
export class ImportProcessor extends WorkerHost {
  constructor(
    @InjectRepository(ImportJob)
    private readonly importJobRepo: Repository<ImportJob>,
    @InjectRepository(User)
    private readonly userRepo: Repository<User>,
    private readonly importCsvParserService: ImportCsvParserService,
    private readonly importUpsertService: ImportUpsertService,
    private readonly importReporterService: ImportReporterService,
  ) {
    super();
  }

  async process(
    job: Job<ProductImportJobPayload>,
  ): Promise<Record<string, unknown>> {
    const importJob = await this.importJobRepo.findOne({
      where: { id: job.data.importJobId },
    });

    if (!importJob) {
      throw new NotFoundException('Import job not found');
    }

    const importUser = await this.userRepo.findOne({
      where: { id: job.data.userId },
      select: ['id', 'email'],
    });

    try {
      importJob.status = ImportJobStatus.PROCESSING;
      await this.importJobRepo.save(importJob);

      const rows = await this.importCsvParserService.parseCSVFromS3(
        job.data.fileKey,
      );
      const groupedData = this.importCsvParserService.groupProducts(rows);
      const groupedEntries = Object.entries(groupedData);
      const totalProcessableRows = groupedEntries.reduce(
        (acc, [, groupedProduct]) => acc + groupedProduct.variants.length,
        0,
      );
      const failedRows: ImportFailureRow[] = [];

      importJob.totalRows = totalProcessableRows;
      importJob.successRows = 0;
      importJob.failedRows = 0;
      importJob.failedRowsData = [];
      await this.importJobRepo.save(importJob);

      for (const [productSku, groupedProduct] of groupedEntries) {
        try {
          await this.importUpsertService.upsertSingleProductGroup({
            productSku,
            groupedProduct,
            userId: job.data.userId,
          });
          importJob.successRows += groupedProduct.variants.length;
        } catch (error) {
          importJob.failedRows += groupedProduct.variants.length;
          failedRows.push({
            sku: productSku,
            error: error?.message || 'Unknown processing error',
            rawData: groupedProduct as unknown as Record<string, unknown>,
          });
        }
      }

      importJob.totalRows = importJob.successRows + importJob.failedRows;
      if (importJob.failedRows === 0) {
        importJob.status = ImportJobStatus.COMPLETED;
      } else if (importJob.successRows === 0) {
        importJob.status = ImportJobStatus.FAILED;
      } else {
        importJob.status = ImportJobStatus.PARTIAL_SUCCESS;
      }
      importJob.failedRowsData = failedRows;

      const uploadedFailureCsv = await this.importReporterService.uploadFailureCsv(
        importJob.id,
        failedRows,
      );
      importJob.errorFileKey = uploadedFailureCsv?.key ?? null;
      await this.importJobRepo.save(importJob);

      if (importUser?.email) {
        await this.importReporterService.sendCompletionEmail({
          email: importUser.email,
          totalRows: importJob.totalRows,
          successRows: importJob.successRows,
          failedRows: importJob.failedRows,
          failureCsvUrl: uploadedFailureCsv?.url ?? null,
        });
      }

      return {
        importJobId: importJob.id,
        status: importJob.status,
        groupedData,
        failedRows,
      };
    } catch (error) {
      importJob.status = ImportJobStatus.FAILED;
      importJob.errorFileKey = null;
      await this.importJobRepo.save(importJob);
      throw new InternalServerErrorException(
        error?.message || 'Import processing failed',
      );
    }
  }
}

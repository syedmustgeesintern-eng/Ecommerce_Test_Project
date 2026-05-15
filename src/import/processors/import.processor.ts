// import.processor.ts

import { Processor, WorkerHost } from '@nestjs/bullmq';
import { Job } from 'bullmq';
import {
  GroupedProducts,
  ImportFailureRow,
  ProductImportCsvRow,
  ProductImportJobPayload,
} from '../interfaces/import-job.interface';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { ImportJob, ImportJobStatus } from '../entities/import.entity';
import {
  InternalServerErrorException,
  NotFoundException,
} from '@nestjs/common';
import { User } from 'src/user/entities/user.entity';
import { ImportUpsertService } from '../import-upsert.service';
import { ImportReporterService } from '../import-reporter.service';
import { S3Service } from 'src/libs/s3/s3.service';
import { parseCsvStream } from 'src/utils/helperFunction';

@Processor('product-import')
export class ImportProcessor extends WorkerHost {
  constructor(
    @InjectRepository(ImportJob)
    private readonly importJobRepo: Repository<ImportJob>,

    @InjectRepository(User)
    private readonly userRepo: Repository<User>,

    private readonly importUpsertService: ImportUpsertService,
    private readonly importReporterService: ImportReporterService,
    private readonly s3Service: S3Service,
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
      importJob.totalRows = 0;
      importJob.successRows = 0;
      importJob.failedRows = 0;
      importJob.failedRowsData = [];

      await this.importJobRepo.save(importJob);

      const failedRows: ImportFailureRow[] = [];

      const stream = await this.s3Service.getFileStream(
        job.data.fileKey,
      );

      /**
       * IMPORTANT:
       * CSV should ideally be sorted by Product Sku
       */

      let currentProductSku = '';
      let currentGroup: GroupedProducts[string] | null = null;

      for await (const row of parseCsvStream<Record<string, string>>(stream)) {
        const parsedRow: ProductImportCsvRow = {
          sku: row['Sku'] ?? '',
          price: row['Price'] ?? '',
          stock: row['Stock'] ?? '',
          size: row['Size'] ?? '',
          color: row['Color'] ?? '',
          productSku: row['Product Sku'] ?? '',
          basePrice: row['Base Price'] ?? '',
          productName: row['Product Name'] ?? '',
        };

        const productSku = parsedRow.productSku.trim();

        if (!productSku) {
          continue;
        }

        /**
         * New product encountered
         */
        if (
          currentProductSku &&
          currentProductSku !== productSku &&
          currentGroup
        ) {
          try {
            await this.importUpsertService.upsertSingleProductGroup({
              productSku: currentProductSku,
              groupedProduct: currentGroup,
              userId: job.data.userId,
            });

            importJob.successRows += currentGroup.variants.length;
          } catch (error) {
            importJob.failedRows += currentGroup.variants.length;

            failedRows.push({
              sku: currentProductSku,
              error: error?.message || 'Unknown processing error',
              rawData:
                currentGroup as unknown as Record<string, unknown>,
            });
          }

          await this.importJobRepo.save(importJob);

          currentGroup = null;
        }

        /**
         * Initialize new group
         */
        if (!currentGroup || currentProductSku !== productSku) {
          currentProductSku = productSku;

          currentGroup = {
            productName: parsedRow.productName.trim(),
            basePrice: parsedRow.basePrice.trim(),
            variants: [],
          };
        }

        /**
         * Add variant
         */
        currentGroup.variants.push({
          sku: parsedRow.sku.trim(),
          price: parsedRow.price.trim(),
          stock: parsedRow.stock.trim(),
          size: parsedRow.size.trim(),
          color: parsedRow.color.trim(),
        });

        importJob.totalRows++;
      }

      /**
       * Process last group
       */
      if (currentGroup && currentProductSku) {
        try {
          await this.importUpsertService.upsertSingleProductGroup({
            productSku: currentProductSku,
            groupedProduct: currentGroup,
            userId: job.data.userId,
          });

          importJob.successRows += currentGroup.variants.length;
        } catch (error) {
          importJob.failedRows += currentGroup.variants.length;

          failedRows.push({
            sku: currentProductSku,
            error: error?.message || 'Unknown processing error',
            rawData:
              currentGroup as unknown as Record<string, unknown>,
          });
        }
      }

      /**
       * Final status
       */
      if (importJob.failedRows === 0) {
        importJob.status = ImportJobStatus.COMPLETED;
      } else if (importJob.successRows === 0) {
        importJob.status = ImportJobStatus.FAILED;
      } else {
        importJob.status = ImportJobStatus.PARTIAL_SUCCESS;
      }

      importJob.failedRowsData = failedRows;

      const uploadedFailureCsv =
        await this.importReporterService.uploadFailureCsv(
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
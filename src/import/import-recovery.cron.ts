import { InjectQueue } from '@nestjs/bullmq';
import { Injectable, Logger } from '@nestjs/common';
import { Cron, CronExpression } from '@nestjs/schedule';
import { InjectRepository } from '@nestjs/typeorm';
import { Queue } from 'bullmq';
import { LessThan, Repository } from 'typeorm';
import { ImportJob, ImportJobStatus } from './entities/import.entity';
import { ProductImportJobPayload } from './interfaces/import-job.interface';

@Injectable()
export class ImportRecoveryCron {
  private readonly logger = new Logger(ImportRecoveryCron.name);

  constructor(
    @InjectRepository(ImportJob)
    private readonly importJobRepo: Repository<ImportJob>,
    @InjectQueue('product-import')
    private readonly productImportQueue: Queue<ProductImportJobPayload>,
  ) {}

  @Cron(CronExpression.EVERY_5_MINUTES)
  async requeueStaleProcessingJobs() {
    const staleThreshold = new Date(Date.now() - 15 * 60 * 1000);
    const staleJobs = await this.importJobRepo.find({
      where: {
        status: ImportJobStatus.PROCESSING,
        updatedAt: LessThan(staleThreshold),
      },
    });

    for (const staleJob of staleJobs) {
      try {
        const payload: ProductImportJobPayload = {
          importJobId: staleJob.id,
          fileKey: staleJob.fileKey,
          userId: staleJob.userId,
        };

        await this.productImportQueue.add('product-import', payload);
        staleJob.status = ImportJobStatus.QUEUED;
        await this.importJobRepo.save(staleJob);
      } catch (error) {
        this.logger.error(
          `Failed to requeue stale import job ${staleJob.id}`,
          error?.stack,
        );
      }
    }
  }
}

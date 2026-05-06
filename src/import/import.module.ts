import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { BullModule } from '@nestjs/bullmq';
import { ImportController } from './import.controller';
import { ImportService } from './import.service';
import { ImportJob } from './entities/import.entity';
import { ImportProcessor } from './processors/import.processor';
import { S3Module } from 'src/libs/s3/s3.module';
import { ImportCsvParserService } from './import-csv-parser.service';
import { ImportRecoveryCron } from './import-recovery.cron';
import { ImportUpsertService } from './import-upsert.service';
import { ImportReporterService } from './import-reporter.service';
import { User } from 'src/user/entities/user.entity';

@Module({
  imports: [
    TypeOrmModule.forFeature([ImportJob, User]),
    S3Module,
    BullModule.registerQueue({
      name: 'product-import',
    }),
  ],
  controllers: [ImportController],
  providers: [
    ImportService,
    ImportProcessor,
    ImportCsvParserService,
    ImportUpsertService,
    ImportReporterService,
    ImportRecoveryCron,
  ],
  exports: [ImportService, ImportCsvParserService],
})
export class ImportModule {}

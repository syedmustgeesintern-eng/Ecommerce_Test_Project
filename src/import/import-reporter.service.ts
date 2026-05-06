import { Injectable } from '@nestjs/common';
import { createObjectCsvStringifier } from 'csv-writer';
import { MailerService } from 'src/libs/mail/mailer.service';
import { S3Service } from 'src/libs/s3/s3.service';
import { ImportFailureRow } from './interfaces/import-job.interface';

@Injectable()
export class ImportReporterService {
  constructor(
    private readonly s3Service: S3Service,
    private readonly mailerService: MailerService,
  ) {}

  async uploadFailureCsv(
    importJobId: string,
    failedRows: ImportFailureRow[],
  ): Promise<{ key: string; url: string } | null> {
    if (!failedRows.length) {
      return null;
    }

    const csvStringifier = createObjectCsvStringifier({
      header: [
        { id: 'sku', title: 'Sku' },
        { id: 'error', title: 'Error' },
        { id: 'rawData', title: 'RawData' },
      ],
    });

    const csvBodyRows = failedRows.map((row) => ({
      sku: row.sku,
      error: row.error,
      rawData: JSON.stringify(row.rawData),
    }));

    const csvContent =
      csvStringifier.getHeaderString() +
      csvStringifier.stringifyRecords(csvBodyRows);

    const errorFileName = `import-errors-${importJobId}.csv`;
    const errorFile: Express.Multer.File = {
      fieldname: 'file',
      originalname: errorFileName,
      encoding: '7bit',
      mimetype: 'text/csv',
      size: Buffer.byteLength(csvContent),
      buffer: Buffer.from(csvContent),
      stream: null as any,
      destination: '',
      filename: errorFileName,
      path: '',
    };

    const uploaded = await this.s3Service.uploadFile(errorFile, 'imports/errors');
    return { key: uploaded.key, url: uploaded.url };
  }

  async sendCompletionEmail(params: {
    email: string;
    totalRows: number;
    successRows: number;
    failedRows: number;
    failureCsvUrl?: string | null;
  }) {
    await this.mailerService.sendImportCompletionSummary(params);
  }
}

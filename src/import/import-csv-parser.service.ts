import { Injectable } from '@nestjs/common';
import csvParser from 'csv-parser';
import { S3Service } from 'src/libs/s3/s3.service';
import {
  GroupedProducts,
  ProductImportCsvRow,
} from './interfaces/import-job.interface';

@Injectable()
export class ImportCsvParserService {
  constructor(private readonly s3Service: S3Service) {}

  async parseCSVFromS3(fileKey: string): Promise<ProductImportCsvRow[]> {
    const stream = await this.s3Service.getFileStream(fileKey);
    const rows: ProductImportCsvRow[] = [];

    return new Promise<ProductImportCsvRow[]>((resolve, reject) => {
      stream
        .pipe(csvParser())
        .on('data', (row: Record<string, string>) => {
          rows.push({
            sku: row['Sku'] ?? '',
            price: row['Price'] ?? '',
            stock: row['Stock'] ?? '',
            size: row['Size'] ?? '',
            color: row['Color'] ?? '',
            productSku: row['Product Sku'] ?? '',
            basePrice: row['Base Price'] ?? '',
            productName: row['Product Name'] ?? '',
          });
        })
        .on('end', () => resolve(rows))
        .on('error', (error) => reject(error));
    });
  }

  groupProducts(rows: any[]): GroupedProducts {
    return rows.reduce<GroupedProducts>((grouped, row) => {
      const productSku = String(row?.productSku ?? '').trim();
      if (!productSku) {
        return grouped;
      }

      if (!grouped[productSku]) {
        grouped[productSku] = {
          productName: String(row?.productName ?? '').trim(),
          basePrice: String(row?.basePrice ?? '').trim(),
          variants: [],
        };
      }

      grouped[productSku].variants.push({
        sku: String(row?.sku ?? '').trim(),
        price: String(row?.price ?? '').trim(),
        stock: String(row?.stock ?? '').trim(),
        size: String(row?.size ?? '').trim(),
        color: String(row?.color ?? '').trim(),
      });

      return grouped;
    }, {});
  }
}

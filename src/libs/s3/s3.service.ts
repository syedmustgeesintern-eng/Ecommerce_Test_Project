import { Injectable } from '@nestjs/common';
import { GetObjectCommand, S3Client, PutObjectCommand } from '@aws-sdk/client-s3';
import { v4 as uuid } from 'uuid';
import { ConfigService } from '@nestjs/config';
import { Readable } from 'stream';

export type S3UploadResult = {
  key: string;
  url: string;
  bucket: string;
};

@Injectable()
export class S3Service {
  private s3: S3Client;

  constructor(private configService: ConfigService) {
    this.s3 = new S3Client({
      region: this.configService.getOrThrow<string>('AWS_REGION'),
      credentials: {
        accessKeyId: this.configService.getOrThrow<string>('AWS_ACCESS_KEY_ID'),
        secretAccessKey: this.configService.getOrThrow<string>(
          'AWS_SECRET_ACCESS_KEY',
        ),
      },
    });
  }

  async uploadFile(
    file: Express.Multer.File,
    folder = 'uploads',
  ): Promise<S3UploadResult> {
    if (!file?.buffer?.length) {
      throw new Error('Invalid upload file');
    }

    const sanitizedFolder = folder.replace(/^\/+|\/+$/g, '') || 'uploads';
    const fileKey = `${sanitizedFolder}/${uuid()}-${file.originalname}`;
    const bucket = this.configService.getOrThrow<string>('AWS_S3_BUCKET_NAME');
    const timeoutMs = 20_000;
    const timeoutSignal = AbortSignal.timeout(timeoutMs);

    try {
      await this.s3.send(
        new PutObjectCommand({
          Bucket: bucket,
          Key: fileKey,
          Body: file.buffer,
          ContentType: file.mimetype,
        }),
        { abortSignal: timeoutSignal },
      );
    } catch (error) {
      throw new Error(`Image upload failed: ${error?.name ?? 'unknown_error'}`);
    }

    const url = `https://${bucket}.s3.${this.configService.get('AWS_REGION')}.amazonaws.com/${fileKey}`;
    return { key: fileKey, url, bucket };
  }

  async getFileStream(fileKey: string): Promise<Readable> {
    const bucket = this.configService.getOrThrow<string>('AWS_S3_BUCKET_NAME');
    const response = await this.s3.send(
      new GetObjectCommand({
        Bucket: bucket,
        Key: fileKey,
      }),
    );

    if (!response.Body) {
      throw new Error('File stream not found');
    }

    if (response.Body instanceof Readable) {
      return response.Body;
    }

    throw new Error('Unsupported S3 body stream type');
  }
}

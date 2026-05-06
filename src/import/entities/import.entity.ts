import {
  Column,
  CreateDateColumn,
  Entity,
  PrimaryGeneratedColumn,
  UpdateDateColumn,
} from 'typeorm';

export enum ImportJobStatus {
  QUEUED = 'QUEUED',
  PROCESSING = 'PROCESSING',
  COMPLETED = 'COMPLETED',
  FAILED = 'FAILED',
  PARTIAL_SUCCESS = 'PARTIAL_SUCCESS',
}

@Entity('import_jobs')
export class ImportJob {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ type: 'uuid' })
  userId: string;

  @Column({ type: 'varchar' })
  fileKey: string;

  @Column({
    type: 'enum',
    enum: ImportJobStatus,
    default: ImportJobStatus.QUEUED,
  })
  status: ImportJobStatus;

  @Column({ type: 'int', default: 0 })
  totalRows: number;

  @Column({ type: 'int', default: 0 })
  successRows: number;

  @Column({ type: 'int', default: 0 })
  failedRows: number;

  @Column({ type: 'jsonb', default: () => "'[]'" })
  failedRowsData: Array<{
    sku: string;
    error: string;
    rawData: Record<string, unknown>;
  }>;

  @Column({ type: 'varchar', nullable: true })
  errorFileKey: string | null;

  @CreateDateColumn()
  createdAt: Date;

  @UpdateDateColumn()
  updatedAt: Date;
}

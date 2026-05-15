import {
  Column,
  CreateDateColumn,
  Entity,
  Index,
  JoinColumn,
  ManyToOne,
  PrimaryGeneratedColumn,
  UpdateDateColumn,
} from 'typeorm';
import { User } from './user.entity';

@Entity('user_addresses')
@Index('IDX_user_addresses_userId', ['userId'])
@Index('IDX_user_addresses_userId_isDefault', ['userId', 'isDefault'])
export class Address {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ type: 'uuid' })
  userId: string;

  @ManyToOne(() => User, (user) => user.addresses, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'userId' })
  user: User;

  @Column({ type: 'varchar', length: 200 })
  fullName: string;

  @Column({ type: 'varchar', length: 32 })
  phoneNumber: string;

  @Column({ type: 'varchar', length: 100 })
  country: string;

  @Column({ type: 'varchar', length: 120 })
  city: string;

  @Column({ type: 'varchar', length: 120, nullable: true })
  state: string | null;

  @Column({ type: 'varchar', length: 32 })
  postalCode: string;

  @Column({ type: 'varchar', length: 255 })
  streetAddress: string;

  /** e.g. Home, Office, Other */
  @Column({ type: 'varchar', length: 50, nullable: true })
  addressLabel: string | null;

  @Column({ type: 'boolean', default: false })
  isDefault: boolean;

  @CreateDateColumn()
  createdAt: Date;

  @UpdateDateColumn()
  updatedAt: Date;
}

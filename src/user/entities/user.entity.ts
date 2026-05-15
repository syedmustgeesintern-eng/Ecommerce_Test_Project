import { Brand } from '../../brand/entities/brand.entity';
import {
  Entity,
  PrimaryGeneratedColumn,
  Column,
  ManyToOne,
  OneToMany,
  OneToOne,
  JoinColumn,
  CreateDateColumn,
} from 'typeorm';
import { ProductReview } from '../../product/entities/product-review.entity';
import { Address } from './address.entity';

@Entity('users')
export class User {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({
    type: 'varchar',
    nullable: true,
  })
  name: string | null;

  @Column({ unique: true })
  email: string;

  @Column()
  password: string;

  @Column({
    type: 'enum',
    enum: ['SUPERADMIN', 'ADMIN', 'MANAGER', 'CUSTOMER', 'BRAND_OWNER'],
    default: 'CUSTOMER',
  })
  role: string;

  @ManyToOne(() => Brand, { nullable: true })
  @JoinColumn({ name: 'brandId' })
  brand: Brand;

  @Column({ nullable: true })
  brandId: string;

  @CreateDateColumn()
  created_at: Date;

  @Column({ type: 'varchar', nullable: true })
  resetToken: string | null;

  @Column({ type: 'timestamp', nullable: true })
  resetTokenExpiry: Date | null;

  @OneToMany(() => ProductReview, (review) => review.user)
  reviews: ProductReview[];

  @OneToMany(() => Address, (address) => address.user)
  addresses: Address[];

  @Column({ type: 'uuid', nullable: true })
  defaultAddressId: string | null;

  @OneToOne(() => Address, { nullable: true, onDelete: 'SET NULL' })
  @JoinColumn({ name: 'defaultAddressId' })
  defaultAddress?: Address;
}

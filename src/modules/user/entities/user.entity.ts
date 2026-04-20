import { Brand } from '../../brand/entities/brand.entity';
import {
  Entity,
  PrimaryGeneratedColumn,
  Column,
  ManyToOne,
  JoinColumn,
  CreateDateColumn,
} from 'typeorm';

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
}

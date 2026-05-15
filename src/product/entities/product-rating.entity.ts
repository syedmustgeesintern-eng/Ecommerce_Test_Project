import {
  Check,
  Column,
  CreateDateColumn,
  Entity,
  JoinColumn,
  OneToOne,
  PrimaryGeneratedColumn,
  UpdateDateColumn,
} from 'typeorm';
import { Product } from './product.entity';

@Entity('product_ratings')
@Check('"averageRating" >= 0 AND "averageRating" <= 5')
@Check('"totalRatings" >= 0')
export class ProductRating {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @OneToOne(() => Product, (product) => product.rating, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'productId' })
  product: Product;

  @Column({ unique: true })
  productId: string;

  @Column({ type: 'double precision', default: 0 })
  averageRating: number;

  @Column({ type: 'int', default: 0 })
  totalRatings: number;

  @CreateDateColumn()
  createdAt: Date;

  @UpdateDateColumn()
  updatedAt: Date;
}

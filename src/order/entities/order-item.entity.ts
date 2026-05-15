import {
  Column,
  Entity,
  Index,
  JoinColumn,
  ManyToOne,
  PrimaryGeneratedColumn,
} from 'typeorm';
import { Order } from './order.entity';
import { Product } from '../../product/entities/product.entity';
import { ProductVariant } from '../../product/entities/product-variant.entity';

@Entity('order_items')
@Index('IDX_order_items_orderId', ['orderId'])
@Index('IDX_order_items_productId', ['productId'])
@Index('IDX_order_items_variantId', ['variantId'])
export class OrderItem {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ type: 'uuid' })
  orderId: string;

  @ManyToOne(() => Order, (order) => order.items, {
    onDelete: 'CASCADE',
  })
  @JoinColumn({ name: 'orderId' })
  order: Order;

  @Column({ type: 'uuid', nullable: true })
  productId: string | null;

  @ManyToOne(() => Product, { nullable: true, onDelete: 'SET NULL' })
  @JoinColumn({ name: 'productId' })
  product: Product | null;

  @Column({ type: 'uuid', nullable: true })
  variantId: string | null;

  @ManyToOne(() => ProductVariant, { nullable: true, onDelete: 'SET NULL' })
  @JoinColumn({ name: 'variantId' })
  variant: ProductVariant | null;

  @Column({ type: 'jsonb', nullable: true })
  selectedAttributes: Record<string, string> | null;

  @Column({ type: 'decimal', precision: 12, scale: 2 })
  unitPrice: string;

  @Column({ type: 'int' })
  quantity: number;
}

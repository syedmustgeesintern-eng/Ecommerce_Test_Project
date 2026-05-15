import {
  Column,
  CreateDateColumn,
  Entity,
  Index,
  JoinColumn,
  ManyToOne,
  OneToMany,
  PrimaryGeneratedColumn,
  UpdateDateColumn,
} from 'typeorm';
import { User } from '../../user/entities/user.entity';
import { Address } from '../../user/entities/address.entity';
import { OrderStatus } from '../enums/order-status.enum';
import { OrderItem } from './order-item.entity';
import { OrderStatusHistory } from './order-status-history.entity';
import { ShippingAddressOverride } from '../types/shipping-address-override.type';

@Entity('orders')
@Index('IDX_orders_userId', ['userId'])
@Index('IDX_orders_status', ['status'])
@Index('IDX_orders_createdAt', ['createdAt'])
@Index('IDX_orders_userId_createdAt', ['userId', 'createdAt'])
export class Order {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ type: 'varchar', unique: true })
  orderNumber: string;

  @Column({ type: 'uuid' })
  userId: string;

  @ManyToOne(() => User, { onDelete: 'RESTRICT' })
  @JoinColumn({ name: 'userId' })
  user: User;

  @OneToMany(() => OrderItem, (item) => item.order, {
    cascade: ['insert', 'update'],
  })
  items: OrderItem[];

  /**
   * FK to user_addresses. Set when customer selected a saved address at checkout.
   * Null when shippingAddressOverride is used instead.
   * ON DELETE SET NULL so the order row survives address deletion — history is preserved
   * via shippingAddressOverride or the override that was stored at order-creation time.
   */
  @Column({ type: 'uuid', nullable: true })
  shippingAddressId: string | null;

  @ManyToOne(() => Address, { nullable: true, onDelete: 'SET NULL', eager: false })
  @JoinColumn({ name: 'shippingAddressId' })
  shippingAddress: Address | null;

  /**
   * Inline shipping address used when the customer typed/edited an address at checkout
   * without saving it to their profile, or when a saved address was modified inline.
   * Takes display precedence over shippingAddress when non-null.
   * Exactly one of (shippingAddressId, shippingAddressOverride) is non-null per order.
   */
  @Column({ type: 'jsonb', nullable: true })
  shippingAddressOverride: ShippingAddressOverride | null;

  @Column({
    type: 'enum',
    enum: OrderStatus,
    default: OrderStatus.PENDING,
  })
  status: OrderStatus;

  @Column({ type: 'decimal', precision: 12, scale: 2 })
  subtotal: string;

  @Column({ type: 'decimal', precision: 12, scale: 2 })
  shippingFee: string;

  @Column({ type: 'decimal', precision: 12, scale: 2 })
  totalAmount: string;

  @OneToMany(() => OrderStatusHistory, (history) => history.order, {
    cascade: ['insert'],
  })
  statusHistory: OrderStatusHistory[];

  @CreateDateColumn()
  createdAt: Date;

  @UpdateDateColumn()
  updatedAt: Date;
}

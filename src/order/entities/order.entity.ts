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
import { OrderStatus } from '../enums/order-status.enum';
import { OrderItem } from './order-item.entity';
import { OrderStatusHistory } from './order-status-history.entity';
import type { ShippingAddressSnapshot } from '../types/shipping-address-override.type';

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
   * Immutable snapshot of the shipping address at checkout time.
   * Never updated after order creation — survives address edits/deletions on the user profile.
   */
  @Column({ type: 'jsonb' })
  shippingAddress: ShippingAddressSnapshot;

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

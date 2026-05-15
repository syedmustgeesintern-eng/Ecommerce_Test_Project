import {
  Column,
  Entity,
  Index,
  JoinColumn,
  ManyToOne,
  PrimaryGeneratedColumn,
} from 'typeorm';
import { Order } from './order.entity';
import { OrderStatus } from '../enums/order-status.enum';

@Entity('order_status_history')
@Index('IDX_order_status_history_orderId', ['orderId'])
@Index('IDX_order_status_history_changedAt', ['changedAt'])
/** Timeline loads: filter by order + sort by changedAt. */
@Index('IDX_order_status_history_orderId_changedAt', [
  'orderId',
  'changedAt',
])
export class OrderStatusHistory {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ type: 'uuid' })
  orderId: string;

  @ManyToOne(() => Order, (order) => order.statusHistory, {
    onDelete: 'CASCADE',
  })
  @JoinColumn({ name: 'orderId' })
  order: Order;

  @Column({
    type: 'enum',
    enum: OrderStatus,
    nullable: true,
  })
  oldStatus: OrderStatus | null;

  @Column({
    type: 'enum',
    enum: OrderStatus,
  })
  newStatus: OrderStatus;

  @Column({ type: 'timestamptz' })
  changedAt: Date;
}

import {
  Column,
  CreateDateColumn,
  Entity,
  JoinColumn,
  ManyToOne,
  PrimaryGeneratedColumn,
  Unique,
  UpdateDateColumn,
} from 'typeorm';
import { Cart } from './cart.entity';
import { ProductVariant } from '../../product/entities/product-variant.entity';

@Entity('cart_items')
@Unique('UQ_cart_items_cart_variant', ['cartId', 'variantId'])
export class CartItem {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ type: 'uuid' })
  cartId: string;

  @ManyToOne(() => Cart, (cart) => cart.items, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'cartId' })
  cart: Cart;

  @Column({ type: 'uuid' })
  variantId: string;

  @ManyToOne(() => ProductVariant, { onDelete: 'CASCADE', eager: false })
  @JoinColumn({ name: 'variantId' })
  variant: ProductVariant;

  @Column({ type: 'int' })
  quantity: number;

  @CreateDateColumn()
  createdAt: Date;

  @UpdateDateColumn()
  updatedAt: Date;
}

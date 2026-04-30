import { Column, Entity, ManyToOne, PrimaryGeneratedColumn } from "typeorm";
import { ProductVariant } from "./product-variant.entity";
import { Product } from "./product.entity";

@Entity('product_images')
export class ProductImage {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column()
  url: string;

  @ManyToOne(() => Product, (p) => p.images, { nullable: true, onDelete: 'CASCADE' })
  product: Product;

  @ManyToOne(() => ProductVariant, (v) => v.images, { nullable: true, onDelete: 'CASCADE' })
  variant: ProductVariant;
}
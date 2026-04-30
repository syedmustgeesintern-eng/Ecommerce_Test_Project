import { Brand } from "../../brand/entities/brand.entity";
import { Column, CreateDateColumn, Entity, Index, JoinTable, ManyToMany, ManyToOne, OneToMany, PrimaryGeneratedColumn, UpdateDateColumn } from "typeorm";
import { ProductAttribute } from "./product-attribute.entity";
import { ProductVariant } from "./product-variant.entity";
import { ProductImage } from "./product-image.entity";
import { Category } from "../../category/entities/category.entity";

@Entity('products')
export class Product {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column()
  name: string;

  @Column({ nullable: true })
  description: string;

  @Column({ type: 'decimal', nullable: true })
  basePrice: number;

  @ManyToOne(() => Brand, (b) => b.id)
  brand: Brand;

  @ManyToMany(() => Category, (c) => c.products)
  @JoinTable({ name: 'product_categories' })
  categories: Category[];

  @OneToMany(() => ProductAttribute, (attr) => attr.product, { cascade: true })
  attributes: ProductAttribute[];

  @OneToMany(() => ProductVariant, (v) => v.product, { cascade: true })
  variants: ProductVariant[];

  @OneToMany(() => ProductImage, (img) => img.product)
  images: ProductImage[];

  @Index()
  @CreateDateColumn()
  createdAt: Date;

  @UpdateDateColumn()
  updatedAt: Date;
}
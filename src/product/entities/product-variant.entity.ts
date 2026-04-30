import { Column, CreateDateColumn, Entity, ManyToOne, OneToMany, PrimaryGeneratedColumn, Unique, UpdateDateColumn } from "typeorm";
import { Product } from "./product.entity";
import { VariantAttributeValue } from "./variant-attribute-value.entity";
import { ProductImage } from "./product-image.entity";

@Entity('product_variants')
@Unique(['sku'])
export class ProductVariant {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column()
  sku: string;

  @Column('decimal')
  price: number;

  @Column('int')
  stock: number;

  @ManyToOne(() => Product, (p) => p.variants, { onDelete: 'CASCADE' })
  product: Product;

  @OneToMany(() => VariantAttributeValue, (vav) => vav.variant, { cascade: true })
  attributeValues: VariantAttributeValue[];

  @OneToMany(() => ProductImage, (img) => img.variant)
  images: ProductImage[];

  @CreateDateColumn()
  createdAt: Date;

  @UpdateDateColumn()
  updatedAt: Date;
}
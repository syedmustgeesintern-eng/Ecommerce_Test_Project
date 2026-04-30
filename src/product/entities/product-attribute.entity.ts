import { Column, Entity, ManyToOne, OneToMany, PrimaryGeneratedColumn } from "typeorm";
import { Product } from "./product.entity";
import { AttributeValue } from "./attribute-value.entity";

@Entity('product_attributes')
export class ProductAttribute {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column()
  name: string;

  @ManyToOne(() => Product, (p) => p.attributes, { onDelete: 'CASCADE' })
  product: Product;

  @OneToMany(() => AttributeValue, (v) => v.attribute, { cascade: true })
  values: AttributeValue[];
}
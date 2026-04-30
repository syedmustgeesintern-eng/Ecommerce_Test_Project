import { Column, Entity, ManyToOne, PrimaryGeneratedColumn } from "typeorm";
import { ProductAttribute } from "./product-attribute.entity";

@Entity('attribute_values')
export class AttributeValue {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column()
  value: string;

  @Column({ type: 'jsonb', nullable: true })
  meta: Record<string, any>;

  @ManyToOne(() => ProductAttribute, (a) => a.values, { onDelete: 'CASCADE' })
  attribute: ProductAttribute;
}
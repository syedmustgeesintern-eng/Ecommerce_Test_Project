import { Entity, ManyToOne, PrimaryGeneratedColumn } from "typeorm";
import { AttributeValue } from "./attribute-value.entity";
import { ProductVariant } from "./product-variant.entity";

@Entity('variant_attribute_values')
export class VariantAttributeValue {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @ManyToOne(() => ProductVariant, (v) => v.attributeValues, { onDelete: 'CASCADE' })
  variant: ProductVariant;

  @ManyToOne(() => AttributeValue, { eager: true, onDelete: 'CASCADE' })
  attributeValue: AttributeValue;
}
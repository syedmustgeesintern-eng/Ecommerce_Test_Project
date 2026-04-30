export class CreateProductDto {
  name: string;
  description?: string;
  basePrice?: number;
 stock?: number;
  categoryIds?: string[];

  variants: {
    sku: string;
    price: number;
    stock: number;

    attributes?: {
      attribute: string;
      value: string;
      meta?: any;
    }[];
  }[];
}
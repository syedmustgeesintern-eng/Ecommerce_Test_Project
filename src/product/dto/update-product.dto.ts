export class UpdateProductDto {
  name?: string;
  description?: string;
  basePrice?: number;
  stock?: number;
  categoryIds?: string[];

  /**
   * Required when `variants` is sent as an empty array (reset to one default variant).
   */
  sku?: string;

  variants?: {
    id?: string;
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

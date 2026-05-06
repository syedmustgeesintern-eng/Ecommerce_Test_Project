export interface ProductImportJobPayload {
  importJobId: string;
  fileKey: string;
  userId: string;
}

export interface ProductImportCsvRow {
  sku: string;
  price: string;
  stock: string;
  size: string;
  color: string;
  productSku: string;
  basePrice: string;
  productName: string;
}

export interface GroupedProductVariant {
  sku: string;
  price: string;
  stock: string;
  size: string;
  color: string;
}

export interface GroupedProductData {
  productName: string;
  basePrice: string;
  variants: GroupedProductVariant[];
}

export type GroupedProducts = Record<string, GroupedProductData>;

export interface ImportFailureRow {
  sku: string;
  error: string;
  rawData: Record<string, unknown>;
}

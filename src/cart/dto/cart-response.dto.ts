import { CartItem } from '../entities/cart-item.entity';

export type CartVariantSummary = {
  id: string;
  sku: string;
  price: number;
  stock: number;
  attributes: Record<string, string>;
};

export type CartProductSummary = {
  id: string;
  name: string;
  sku: string | null;
  imageUrl: string | null;
};

export type CartLineResponse = {
  id: string;
  quantity: number;
  unitPrice: number;
  variant: CartVariantSummary;
  product: CartProductSummary;
};

export class CartResponseDto {
  cartId: string;
  items: CartLineResponse[];
  itemCount: number;
  // subtotal: number;
}

function pickImageUrl(variant: CartItem['variant']): string | null {
  const variantImg = variant?.images?.[0]?.url;
  if (variantImg) return variantImg;
  return variant?.product?.['images']?.[0]?.url ?? null;
}

function buildAttributes(variant: CartItem['variant']): Record<string, string> {
  const out: Record<string, string> = {};
  for (const vav of variant?.attributeValues ?? []) {
    const name = vav.attributeValue?.attribute?.name;
    const value = vav.attributeValue?.value;
    if (name && value !== undefined && value !== null) {
      out[name] = String(value);
    }
  }
  return out;
}

export function mapCartToResponseDto(
  cartId: string,
  items: CartItem[],
): CartResponseDto {
  const lines: CartLineResponse[] = items.map((row) => {
    const variant = row.variant;
    const product = variant?.product;
    const unitPrice = Number(variant.price);
    const qty = row.quantity;

    return {
      id: row.id,
      quantity: qty,
      unitPrice,
      variant: {
        id: variant.id,
        sku: variant.sku,
        price: unitPrice,
        stock: variant.stock,
        attributes: buildAttributes(variant),
      },
      product: {
        id: product?.id ?? '',
        name: product?.name ?? '',
        sku: product?.sku ?? null,
        imageUrl: pickImageUrl(variant),
      },
    };
  });

  const itemCount = lines.reduce((s, l) => s + l.quantity, 0);
  // const subtotal =
  //   Math.round(lines.reduce((s, l) => s + l.lineTotal, 0) * 100) / 100;

  return {
    cartId,
    items: lines,
    itemCount,
    // subtotal,
  };
}

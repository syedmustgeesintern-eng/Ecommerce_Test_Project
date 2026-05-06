import {
  BadRequestException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { DataSource } from 'typeorm';
import { GroupedProductData } from './interfaces/import-job.interface';
import { User } from 'src/user/entities/user.entity';
import { Product } from 'src/product/entities/product.entity';
import { ProductVariant } from 'src/product/entities/product-variant.entity';
import { ProductAttribute } from 'src/product/entities/product-attribute.entity';
import { AttributeValue } from 'src/product/entities/attribute-value.entity';
import { VariantAttributeValue } from 'src/product/entities/variant-attribute-value.entity';

@Injectable()
export class ImportUpsertService {
  constructor(private readonly dataSource: DataSource) {}

  private parseNumber(value: string, fieldName: string): number {
    const parsed = Number(value);
    if (Number.isNaN(parsed)) {
      throw new BadRequestException(`Invalid ${fieldName}: ${value}`);
    }
    return parsed;
  }

  async upsertSingleProductGroup(params: {
    productSku: string;
    groupedProduct: GroupedProductData;
    userId: string;
  }) {
    const queryRunner = this.dataSource.createQueryRunner();
    await queryRunner.connect();
    await queryRunner.startTransaction();

    try {
      const user = await queryRunner.manager.findOne(User, {
        where: { id: params.userId },
      });

      if (!user) {
        throw new NotFoundException('Import user not found');
      }

      let product: Product | null = null;
      if (user.brandId) {
        product = await queryRunner.manager
          .createQueryBuilder(Product, 'product')
          .leftJoin('product.brand', 'brand')
          .where('product.sku = :sku', { sku: params.productSku })
          .andWhere('brand.id = :brandId', { brandId: user.brandId })
          .getOne();
      } else {
        product = await queryRunner.manager.findOne(Product, {
          where: { sku: params.productSku },
        });
      }

      const basePrice = this.parseNumber(
        params.groupedProduct.basePrice,
        'basePrice',
      );

      if (product) {
        product.name = params.groupedProduct.productName;
        product.basePrice = basePrice;
      } else {
        product = queryRunner.manager.create(Product, {
          name: params.groupedProduct.productName,
          basePrice,
          sku: params.productSku,
          brand: user.brandId ? ({ id: user.brandId } as any) : null,
        });
      }

      product = await queryRunner.manager.save(product);

      const existingVariants = await queryRunner.manager.find(ProductVariant, {
        where: { product: { id: product.id } },
      });
      const existingBySku = new Map(existingVariants.map((v) => [v.sku, v]));
      const keptVariantIds = new Set<string>();
      const savedVariantsBySku = new Map<string, ProductVariant>();

      for (const variantRow of params.groupedProduct.variants) {
        const price = this.parseNumber(variantRow.price, 'price');
        const stock = this.parseNumber(variantRow.stock, 'stock');
        const variantSku = String(variantRow.sku).trim();

        if (!variantSku) {
          throw new BadRequestException('Variant sku is required');
        }

        const existingVariant = existingBySku.get(variantSku);
        const variant = existingVariant
          ? existingVariant
          : queryRunner.manager.create(ProductVariant, {
              sku: variantSku,
              product,
            });

        variant.price = price;
        variant.stock = stock;
        variant.sku = variantSku;

        const savedVariant = await queryRunner.manager.save(variant);
        keptVariantIds.add(savedVariant.id);
        savedVariantsBySku.set(savedVariant.sku, savedVariant);
      }

      const staleVariantIds = existingVariants
        .filter((variant) => !keptVariantIds.has(variant.id))
        .map((variant) => variant.id);

      if (staleVariantIds.length) {
        await queryRunner.manager
          .createQueryBuilder()
          .delete()
          .from(ProductVariant)
          .where('id IN (:...ids)', { ids: staleVariantIds })
          .execute();
      }

      // Rebuild attribute graph for this imported product group.
      // This keeps import behavior deterministic and avoids stale links.
      await queryRunner.manager
        .createQueryBuilder()
        .delete()
        .from(ProductAttribute)
        .where('"productId" = :productId', { productId: product.id })
        .execute();

      const sizeValues = new Set<string>();
      const colorValues = new Set<string>();
      for (const variantRow of params.groupedProduct.variants) {
        const size = String(variantRow.size ?? '').trim();
        const color = String(variantRow.color ?? '').trim();
        if (size) sizeValues.add(size);
        if (color) colorValues.add(color);
      }

      const attributeValueMap = new Map<string, AttributeValue>();

      if (sizeValues.size) {
        const sizeAttribute = await queryRunner.manager.save(
          queryRunner.manager.create(ProductAttribute, {
            name: 'Size',
            product,
          }),
        );

        for (const size of sizeValues) {
          const valueEntity = await queryRunner.manager.save(
            queryRunner.manager.create(AttributeValue, {
              value: size,
              attribute: sizeAttribute,
            }),
          );
          attributeValueMap.set(`Size-${size}`, valueEntity);
        }
      }

      if (colorValues.size) {
        const colorAttribute = await queryRunner.manager.save(
          queryRunner.manager.create(ProductAttribute, {
            name: 'Color',
            product,
          }),
        );

        for (const color of colorValues) {
          const valueEntity = await queryRunner.manager.save(
            queryRunner.manager.create(AttributeValue, {
              value: color,
              attribute: colorAttribute,
            }),
          );
          attributeValueMap.set(`Color-${color}`, valueEntity);
        }
      }

      for (const variantRow of params.groupedProduct.variants) {
        const variantSku = String(variantRow.sku ?? '').trim();
        const savedVariant = savedVariantsBySku.get(variantSku);
        if (!savedVariant) {
          continue;
        }

        await queryRunner.manager
          .createQueryBuilder()
          .delete()
          .from(VariantAttributeValue)
          .where('"variantId" = :variantId', { variantId: savedVariant.id })
          .execute();

        const size = String(variantRow.size ?? '').trim();
        const color = String(variantRow.color ?? '').trim();

        if (size) {
          const sizeValue = attributeValueMap.get(`Size-${size}`);
          if (sizeValue) {
            await queryRunner.manager.save(
              queryRunner.manager.create(VariantAttributeValue, {
                variant: savedVariant,
                attributeValue: sizeValue,
              }),
            );
          }
        }

        if (color) {
          const colorValue = attributeValueMap.get(`Color-${color}`);
          if (colorValue) {
            await queryRunner.manager.save(
              queryRunner.manager.create(VariantAttributeValue, {
                variant: savedVariant,
                attributeValue: colorValue,
              }),
            );
          }
        }
      }

      await queryRunner.commitTransaction();
    } catch (error) {
      await queryRunner.rollbackTransaction();
      throw error;
    } finally {
      await queryRunner.release();
    }
  }
}

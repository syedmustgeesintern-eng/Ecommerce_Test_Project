import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { DataSource, In, Repository } from 'typeorm';
import { Product } from './entities/product.entity';
import { S3Service } from 'src/libs/s3/s3.service';
import { CreateProductDto } from './dto/create-product.dto';
import { AttributeValue } from './entities/attribute-value.entity';
import { ProductAttribute } from './entities/product-attribute.entity';
import { ProductVariant } from './entities/product-variant.entity';
import { VariantAttributeValue } from './entities/variant-attribute-value.entity';
import { ProductImage } from './entities/product-image.entity';
import { Category } from 'src/category/entities/category.entity';

@Injectable()
export class ProductService {
  constructor(
    private dataSource: DataSource,
    @InjectRepository(Product) private productRepo: Repository<Product>,
    @InjectRepository(Category) private categoryRepo: Repository<Category>,
    private s3Service: S3Service,
  ) {}

  async createProduct(
    dto: CreateProductDto,
    files: Express.Multer.File[],
    brandId: string,
  ) {
    const queryRunner = this.dataSource.createQueryRunner();
    await queryRunner.connect();
    await queryRunner.startTransaction();

    try {
      // ✅ 1. Create Product
      const product = queryRunner.manager.create(Product, {
        name: dto.name,
        description: dto.description,
        basePrice: dto.basePrice,
        brand: { id: brandId },
      });
      if (!dto.variants || dto.variants.length === 0) {
        dto.variants = [
          {
            sku: `DEFAULT-${Date.now()}`,
            price: dto.basePrice || 0,
            stock: dto.stock || 0,
            attributes: [],
          },
        ];
      }

      // ✅ 2. Categories (optional)
      if (dto.categoryIds?.length) {
        product.categories = await this.categoryRepo.findBy({
          id: In(dto.categoryIds),
        });
      }

      await queryRunner.manager.save(product);

      // ✅ 3. ATTRIBUTE EXTRACTION (from variants)
      const attributeMap = new Map<string, AttributeValue>();
      const attributeEntityMap = new Map<string, ProductAttribute>();

      for (const variant of dto.variants) {
        for (const attr of variant.attributes || []) {
          const attrName = attr.attribute;
          const key = `${attrName}-${attr.value}`;

          // Create attribute if not exists
          if (!attributeEntityMap.has(attrName)) {
            const attributeEntity = queryRunner.manager.create(
              ProductAttribute,
              {
                name: attrName,
                product,
              },
            );

            await queryRunner.manager.save(attributeEntity);
            attributeEntityMap.set(attrName, attributeEntity);
          }

          // Create value if not exists
          if (!attributeMap.has(key)) {
            const valueEntity = queryRunner.manager.create(AttributeValue, {
              value: attr.value,
              meta: attr.meta,
              attribute: attributeEntityMap.get(attrName),
            });

            await queryRunner.manager.save(valueEntity);
            attributeMap.set(key, valueEntity);
          }
        }
      }

      // ✅ 4. Create Variants (MANDATORY)
      for (const variantDto of dto.variants) {
        const variant = queryRunner.manager.create(ProductVariant, {
          sku: variantDto.sku,
          price: variantDto.price,
          stock: variantDto.stock,
          product,
        });

        await queryRunner.manager.save(variant);

        for (const attr of variantDto.attributes || []) {
          const key = `${attr.attribute}-${attr.value}`;
          const value = attributeMap.get(key);

          if (!value) {
            throw new Error(`Invalid attribute mapping: ${key}`);
          }

          const vav = queryRunner.manager.create(VariantAttributeValue, {
            variant,
            attributeValue: value,
          });

          await queryRunner.manager.save(vav);
        }
      }

      // ✅ 5. Images (Product level)
      if (files?.length) {
        for (const file of files) {
          const url = await this.s3Service.uploadFile(file);

          const image = queryRunner.manager.create(ProductImage, {
            url,
            product,
          });

          await queryRunner.manager.save(image);
        }
      }

      await queryRunner.commitTransaction();

      return { message: 'Product created successfully' };
    } catch (err) {
      await queryRunner.rollbackTransaction();

      if (err.code === '23505') {
        throw new Error('Duplicate SKU detected');
      }

      throw err;
    } finally {
      await queryRunner.release();
    }
  }
 async getMyProducts(
  brandId: string,
  limit = 10,
  cursor?: string,
) {
  const take = Number(limit);

  const query = this.productRepo
    .createQueryBuilder('product')
    .leftJoinAndSelect('product.categories', 'category')
    .leftJoinAndSelect('product.attributes', 'attribute')
    .leftJoinAndSelect('attribute.values', 'attributeValues')
    .leftJoinAndSelect('product.variants', 'variant')
    .leftJoinAndSelect('variant.attributeValues', 'vav')
    .leftJoinAndSelect('vav.attributeValue', 'attrValue')
    .leftJoinAndSelect('attrValue.attribute', 'attr')
    .leftJoinAndSelect('product.images', 'productImages')
    .leftJoinAndSelect('variant.images', 'variantImages')
    .where('product.brandId = :brandId', { brandId })
    .orderBy('product.createdAt', 'DESC')
    .take(take + 1);

  if (cursor) {
    query.andWhere('product.createdAt < :cursor', {
      cursor: new Date(cursor),
    });
  }

  const products = await query.getMany();

  const hasNext = products.length > take;
  const data = hasNext ? products.slice(0, -1) : products;

  return {
    data: data.map((product) => ({
      id: product.id,
      name: product.name,
      description: product.description,
      basePrice: product.basePrice,

      categories: product.categories?.map((c) => ({
        id: c.id,
        name: c.name,
      })),

      attributes: product.attributes?.map((attr) => ({
        name: attr.name,
        values: attr.values.map((v) => ({
          value: v.value,
          meta: v.meta,
        })),
      })),

      variants: product.variants?.map((variant) => ({
        id: variant.id,
        sku: variant.sku,
        price: variant.price,
        stock: variant.stock,

        attributes: variant.attributeValues?.map((vav) => ({
          attribute: vav.attributeValue?.attribute?.name,
          value: vav.attributeValue?.value,
        })),

        images: variant.images?.map((img) => img.url),
      })),

      images: product.images?.map((img) => img.url),
    })),

    nextCursor: hasNext
      ? data[data.length - 1].createdAt
      : null,
  };
}

  async getAllProducts(limit = 10, cursor?: string) {
    const take = Number(limit);

    const query = this.productRepo
      .createQueryBuilder('product')
      .leftJoinAndSelect('product.categories', 'category')
      .leftJoinAndSelect('product.attributes', 'attribute')
      .leftJoinAndSelect('attribute.values', 'attributeValues')
      .leftJoinAndSelect('product.variants', 'variant')
      .leftJoinAndSelect('variant.attributeValues', 'vav')
      .leftJoinAndSelect('vav.attributeValue', 'attrValue')
      .leftJoinAndSelect('attrValue.attribute', 'attr')
      .leftJoinAndSelect('product.images', 'productImages')
      .leftJoinAndSelect('variant.images', 'variantImages')
      .orderBy('product.createdAt', 'DESC')
      .take(take + 1);

    if (cursor) {
      query.where('product.createdAt < :cursor', {
        cursor: new Date(cursor),
      });
    }

    const products = await query.getMany();

    const hasNext = products.length > take;
    const data = hasNext ? products.slice(0, -1) : products;

    return {
      data: data.map((product) => ({
        id: product.id,
        name: product.name,
        description: product.description,
        basePrice: product.basePrice,

        categories: product.categories?.map((c) => ({
          id: c.id,
          name: c.name,
        })),

        attributes: product.attributes?.map((attr) => ({
          name: attr.name,
          values: attr.values.map((v) => ({
            value: v.value,
            meta: v.meta,
          })),
        })),

        variants: product.variants?.map((variant) => ({
          id: variant.id,
          sku: variant.sku,
          price: variant.price,
          stock: variant.stock,

          attributes: variant.attributeValues.map((vav) => ({
            attribute: vav.attributeValue?.attribute?.name,
            value: vav.attributeValue?.value,
          })),

          images: variant.images?.map((img) => img.url),
        })),

        images: product.images?.map((img) => img.url),
      })),

      nextCursor: hasNext ? data[data.length - 1].createdAt : null,
    };
  }
}

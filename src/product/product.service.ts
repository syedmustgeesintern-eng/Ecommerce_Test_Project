import {
  BadRequestException,
  ForbiddenException,
  Injectable,
  InternalServerErrorException,
  NotFoundException,
  RequestTimeoutException,
} from '@nestjs/common';
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
import { UpdateProductDto } from './dto/update-product.dto';

@Injectable()
export class ProductService {
  constructor(
    private dataSource: DataSource,
    @InjectRepository(Product) private productRepo: Repository<Product>,
    @InjectRepository(Category) private categoryRepo: Repository<Category>,
    private s3Service: S3Service,
  ) {}

  private requireNonBlankSku(
    value: unknown,
    message = 'sku is required',
  ): string {
    if (value === undefined || value === null || String(value).trim() === '') {
      throw new BadRequestException(message);
    }
    return String(value).trim();
  }

  private buildProductResponse(product: Product) {
    return {
      id: product.id,
      name: product.name,
      description: product.description,
      basePrice: product.basePrice,
      sku: product.sku ?? null,
      categories:
        product.categories?.map((c) => ({
          id: c.id,
          name: c.name,
        })) || [],
      attributes:
        product.attributes?.map((attr) => ({
          name: attr.name,
          values:
            attr.values?.map((v) => ({
              value: v.value,
              meta: v.meta,
            })) || [],
        })) || [],
      variants:
        product.variants?.map((variant) => ({
          id: variant.id,
          sku: variant.sku,
          price: variant.price,
          stock: variant.stock,
          attributes:
            variant.attributeValues?.map((vav) => ({
              attribute: vav.attributeValue?.attribute?.name,
              value: vav.attributeValue?.value,
            })) || [],
          images: variant.images?.map((img) => img.url) || [],
        })) || [],
      images: product.images?.map((img) => img.url) || [],
      createdAt: product.createdAt,
      updatedAt: product.updatedAt,
    };
  }

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
        sku: null,
      });
      let variantsToProcess: NonNullable<CreateProductDto['variants']>;
      if (dto.variants?.length) {
        variantsToProcess = dto.variants;
        if (dto.sku !== undefined && String(dto.sku).trim() !== '') {
          product.sku = String(dto.sku).trim();
        }
      } else {
        const defaultSku = this.requireNonBlankSku(
          dto.sku,
          'Product sku is required when variants are omitted or empty',
        );
        product.sku = defaultSku;
        variantsToProcess = [
          {
            sku: defaultSku,
            price: dto.basePrice ?? 0,
            stock: dto.stock ?? 0,
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

      for (const variant of variantsToProcess) {
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
      for (const variantDto of variantsToProcess) {
        if (
          variantDto.sku === undefined ||
          variantDto.sku === null ||
          String(variantDto.sku).trim() === ''
        ) {
          throw new BadRequestException('Variant sku is required');
        }
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
            throw new BadRequestException(`Invalid attribute mapping: ${key}`);
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
          const uploadPromise = this.s3Service.uploadFile(file, 'products');
          const timeoutPromise = new Promise<never>((_, reject) => {
            setTimeout(() => {
              reject(
                new RequestTimeoutException(
                  `Upload timed out for file: ${file.originalname}`,
                ),
              );
            }, 20_000);
          });

          const uploaded = await Promise.race([uploadPromise, timeoutPromise]);
          const url = uploaded.url;

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

      if (
        err instanceof BadRequestException ||
        err instanceof RequestTimeoutException
      ) {
        throw err;
      }

      if (err.code === '23505') {
        throw new InternalServerErrorException('Duplicate SKU detected');
      }

      throw new InternalServerErrorException(
        err?.message || 'Failed to create product',
      );
    } finally {
      await queryRunner.release();
    }
  }
  async getMyProducts(brandId: string, limit = 10, cursor?: string) {
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
      data: data.map((product) => this.buildProductResponse(product)),

      nextCursor: hasNext ? data[data.length - 1].createdAt : null,
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
      data: data.map((product) => this.buildProductResponse(product)),

      nextCursor: hasNext ? data[data.length - 1].createdAt : null,
    };
  }

  async getProductById(productId: string) {
    const product = await this.productRepo.findOne({
      where: { id: productId },
      relations: {
        categories: true,
        attributes: { values: true },
        variants: {
          attributeValues: { attributeValue: { attribute: true } },
          images: true,
        },
        images: true,
      },
    });

    if (!product) {
      throw new NotFoundException('Product not found');
    }

    return this.buildProductResponse(product);
  }

  async updateProduct(
    productId: string,
    dto: UpdateProductDto,
    files: Express.Multer.File[],
    brandId: string,
  ) {
    const queryRunner = this.dataSource.createQueryRunner();
    await queryRunner.connect();
    await queryRunner.startTransaction();

    try {
      const product = await queryRunner.manager.findOne(Product, {
        where: { id: productId },
        relations: {
          categories: true,
        },
      });

      if (!product) {
        throw new NotFoundException('Product not found');
      }

      const productWithBrand = await queryRunner.manager
        .createQueryBuilder(Product, 'product')
        .leftJoinAndSelect('product.brand', 'brand')
        .where('product.id = :productId', { productId })
        .getOne();

      if (!productWithBrand || productWithBrand.brand?.id !== brandId) {
        throw new ForbiddenException('You can only update your own products');
      }

      if (dto.name !== undefined) product.name = dto.name;
      if (dto.description !== undefined) product.description = dto.description;
      if (dto.basePrice !== undefined) product.basePrice = dto.basePrice;

      if (dto.sku !== undefined) {
        const trimmed = String(dto.sku ?? '').trim();
        product.sku = trimmed === '' ? null : trimmed;
      }

      if (dto.categoryIds) {
        product.categories = dto.categoryIds.length
          ? await this.categoryRepo.findBy({ id: In(dto.categoryIds) })
          : [];
      }

      if (dto.variants !== undefined) {
        let incomingVariants = [...dto.variants];
        if (!incomingVariants.length) {
          const defaultSku = this.requireNonBlankSku(
            dto.sku,
            'Product sku is required when variants is an empty array',
          );
          product.sku = defaultSku;
          incomingVariants = [
            {
              sku: defaultSku,
              price:
                dto.basePrice !== undefined
                  ? Number(dto.basePrice)
                  : Number(product.basePrice ?? 0),
              stock: dto.stock ?? 0,
              attributes: [],
            },
          ];
        }

        const incomingSkuSet = new Set<string>();
        for (const variant of incomingVariants) {
          const cleanedSku = this.requireNonBlankSku(variant.sku);
          variant.sku = cleanedSku;
          if (incomingSkuSet.has(cleanedSku)) {
            throw new BadRequestException(
              `Duplicate sku in payload: ${cleanedSku}`,
            );
          }
          incomingSkuSet.add(cleanedSku);
        }

        const existingVariants = await queryRunner.manager.find(ProductVariant, {
          where: { product: { id: product.id } },
        });

        const existingById = new Map(existingVariants.map((v) => [v.id, v]));
        const existingBySku = new Map(existingVariants.map((v) => [v.sku, v]));
        const keptVariantIds = new Set<string>();
        const consumedExistingIds = new Set<string>();

        const existingAttributes = await queryRunner.manager.find(
          ProductAttribute,
          {
            where: { product: { id: product.id } },
            relations: { values: true },
          },
        );

        const existingAttributeByName = new Map(
          existingAttributes.map((attr) => [attr.name, attr]),
        );
        const expectedAttributeValues = new Map<
          string,
          Map<string, Record<string, any> | undefined>
        >();

        for (const variant of incomingVariants) {
          for (const attr of variant.attributes || []) {
            if (!expectedAttributeValues.has(attr.attribute)) {
              expectedAttributeValues.set(attr.attribute, new Map());
            }
            expectedAttributeValues
              .get(attr.attribute)
              ?.set(attr.value, attr.meta);
          }
        }

        const attributeValueMap = new Map<string, AttributeValue>();

        for (const [attrName, valuesMap] of expectedAttributeValues) {
          let attributeEntity = existingAttributeByName.get(attrName);
          if (!attributeEntity) {
            attributeEntity = queryRunner.manager.create(ProductAttribute, {
              name: attrName,
              product,
            });
            attributeEntity = await queryRunner.manager.save(attributeEntity);
          }

          const existingValueByText = new Map(
            (attributeEntity.values || []).map((v) => [v.value, v]),
          );

          for (const [value, meta] of valuesMap) {
            let valueEntity = existingValueByText.get(value);
            if (!valueEntity) {
              valueEntity = queryRunner.manager.create(AttributeValue, {
                value,
                meta: meta as any,
                attribute: attributeEntity,
              });
            } else {
              valueEntity.meta = meta as any;
            }
            valueEntity = await queryRunner.manager.save(valueEntity);
            attributeValueMap.set(`${attrName}-${value}`, valueEntity);
          }
        }

        for (const variantDto of incomingVariants) {
          let variant: ProductVariant | undefined;
          if (variantDto.id && existingById.has(variantDto.id)) {
            variant = existingById.get(variantDto.id);
          } else if (existingBySku.has(variantDto.sku)) {
            variant = existingBySku.get(variantDto.sku);
          }

          if (variant && consumedExistingIds.has(variant.id)) {
            throw new BadRequestException(
              `Duplicate variant mapping in payload for sku: ${variantDto.sku}`,
            );
          }

          if (!variant) {
            variant = queryRunner.manager.create(ProductVariant, { product });
          }

          variant.sku = variantDto.sku;
          variant.price = variantDto.price;
          variant.stock = variantDto.stock;

          variant = await queryRunner.manager.save(variant);
          keptVariantIds.add(variant.id);
          consumedExistingIds.add(variant.id);

          await queryRunner.manager
            .createQueryBuilder()
            .delete()
            .from(VariantAttributeValue)
            .where('"variantId" = :variantId', { variantId: variant.id })
            .execute();

          for (const attr of variantDto.attributes || []) {
            const key = `${attr.attribute}-${attr.value}`;
            const value = attributeValueMap.get(key);

            if (!value) {
              throw new BadRequestException(
                `Invalid attribute mapping: ${key}`,
              );
            }

            const vav = queryRunner.manager.create(VariantAttributeValue, {
              variant,
              attributeValue: value,
            });

            await queryRunner.manager.save(vav);
          }
        }

        const variantsToDelete = existingVariants
          .filter((variant) => !keptVariantIds.has(variant.id))
          .map((variant) => variant.id);

        if (variantsToDelete.length) {
          await queryRunner.manager
            .createQueryBuilder()
            .delete()
            .from(ProductVariant)
            .where('id IN (:...ids)', { ids: variantsToDelete })
            .execute();
        }

        for (const existingAttr of existingAttributes) {
          if (!expectedAttributeValues.has(existingAttr.name)) {
            await queryRunner.manager.delete(ProductAttribute, existingAttr.id);
            continue;
          }

          const expectedValues = expectedAttributeValues.get(existingAttr.name)!;
          for (const existingValue of existingAttr.values || []) {
            if (!expectedValues.has(existingValue.value)) {
              await queryRunner.manager.delete(AttributeValue, existingValue.id);
            }
          }
        }
      }

      await queryRunner.manager.save(product);

      if (files?.length) {
        for (const file of files) {
          const uploadPromise = this.s3Service.uploadFile(file, 'products');
          const timeoutPromise = new Promise<never>((_, reject) => {
            setTimeout(() => {
              reject(
                new RequestTimeoutException(
                  `Upload timed out for file: ${file.originalname}`,
                ),
              );
            }, 20_000);
          });

          const uploaded = await Promise.race([uploadPromise, timeoutPromise]);
          const url = uploaded.url;
          const image = queryRunner.manager.create(ProductImage, {
            url,
            product,
          });
          await queryRunner.manager.save(image);
        }
      }

      await queryRunner.commitTransaction();
      return { message: 'Product updated successfully' };
    } catch (err) {
      await queryRunner.rollbackTransaction();

      if (
        err instanceof RequestTimeoutException ||
        err instanceof BadRequestException ||
        err instanceof NotFoundException ||
        err instanceof ForbiddenException
      ) {
        throw err;
      }

      if (err.code === '23505') {
        throw new InternalServerErrorException('Duplicate SKU detected');
      }

      throw new InternalServerErrorException(
        err?.message || 'Failed to update product',
      );
    } finally {
      await queryRunner.release();
    }
  }

  async deleteProduct(productId: string, brandId: string) {
    const product = await this.productRepo
      .createQueryBuilder('product')
      .leftJoinAndSelect('product.brand', 'brand')
      .where('product.id = :productId', { productId })
      .getOne();

    if (!product) {
      throw new NotFoundException('Product not found');
    }

    if (product.brand?.id !== brandId) {
      throw new ForbiddenException('You can only delete your own products');
    }

    await this.productRepo.delete(productId);
    return { message: 'Product deleted successfully' };
  }
}

import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { Product } from './entities/product.entity';
import { ProductAttribute } from './entities/product-attribute.entity';
import { AttributeValue } from './entities/attribute-value.entity';
import { ProductVariant } from './entities/product-variant.entity';
import { VariantAttributeValue } from './entities/variant-attribute-value.entity';
import { ProductImage } from './entities/product-image.entity';
import { S3Module } from 'src/libs/s3/s3.module';
import { ProductController } from './product.controller';
import { ProductService } from './product.service';
import { Category } from 'src/category/entities/category.entity';

@Module({
    imports: [
        TypeOrmModule.forFeature([
            Product,
            Category,
            ProductAttribute,
            AttributeValue,
            ProductVariant,
            VariantAttributeValue,
            ProductImage,
        ]),
        S3Module,
    ],
    controllers: [ProductController],
    providers: [ProductService],
})
export class ProductModule {}
import { Injectable, NotFoundException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { EntityManager, Repository } from 'typeorm';
import { ProductReview } from './entities/product-review.entity';
import { ProductRating } from './entities/product-rating.entity';
import { AddReviewDto } from './dto/add-review.dto';
import { Product } from './entities/product.entity';

@Injectable()
export class ProductReviewService {
  constructor(
    @InjectRepository(ProductReview)
    private readonly reviewRepository: Repository<ProductReview>,
    @InjectRepository(ProductRating)
    private readonly ratingRepository: Repository<ProductRating>,
    @InjectRepository(Product)
    private readonly productRepository: Repository<Product>,
  ) {}

  private async ensureProductExists(productId: string) {
    const exists = await this.productRepository.exists({
      where: { id: productId },
    });

    if (!exists) {
      throw new NotFoundException('Product not found');
    }
  }

  async addOrUpdateReview(
    productId: string,
    userId: string,
    dto: AddReviewDto,
    manager?: EntityManager,
  ) {
    const execTransaction = async (em: EntityManager) => {
      // 1. Ensure product exists
      const product = await em.findOne(Product, { where: { id: productId } });
      if (!product) {
        throw new NotFoundException('Product not found');
      }

      // 2. Find existing review
      let review = await em.findOne(ProductReview, {
        where: { productId, userId },
      });

      if (review) {
        review.rating = dto.rating;
        review.review = dto.review ?? review.review;
      } else {
        review = em.create(ProductReview, {
          productId,
          userId,
          rating: dto.rating,
          review: dto.review,
        });
      }

      await em.save(ProductReview, review);

      // 3. Recalculate average
      const result = await em
        .createQueryBuilder(ProductReview, 'review')
        .select('AVG(review.rating)', 'average')
        .addSelect('COUNT(review.id)', 'count')
        .where('review.productId = :productId', { productId })
        .getRawOne();

      const average = parseFloat(result.average || '0');
      const count = parseInt(result.count || '0', 10);

      // 4. Update rating
      let rating = await em.findOne(ProductRating, { where: { productId } });
      if (rating) {
        rating.averageRating = average;
        rating.totalRatings = count;
      } else {
        rating = em.create(ProductRating, {
          productId,
          averageRating: average,
          totalRatings: count,
        });
      }

      await em.save(ProductRating, rating);

      return review;
    };

    if (manager) {
      return execTransaction(manager);
    } else {
      return this.reviewRepository.manager.transaction(execTransaction);
    }
  }

  async getProductReviews(productId: string) {
    await this.ensureProductExists(productId);

    return this.reviewRepository.find({
      where: { productId },
      relations: ['user'],
      select: {
        id: true,
        rating: true,
        review: true,
        createdAt: true,
        updatedAt: true,
        user: {
          id: true,
          name: true,
        },
      },
      order: {
        createdAt: 'DESC',
      },
    });
  }

  async getProductRating(productId: string) {
    await this.ensureProductExists(productId);

    const rating = await this.ratingRepository.findOne({
      where: { productId },
    });

    if (!rating) {
      return {
        averageRating: 0,
        totalRatings: 0,
      };
    }

    return {
      averageRating: rating.averageRating,
      totalRatings: rating.totalRatings,
    };
  }
}

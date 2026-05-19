import {
  BadRequestException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { Cart } from './entities/cart.entity';
import { CartItem } from './entities/cart-item.entity';
import { ProductVariant } from '../product/entities/product-variant.entity';
import { AddCartItemDto } from './dto/add-cart-item.dto';
import { UpdateCartItemDto } from './dto/update-cart-item.dto';
import { CartResponseDto, mapCartToResponseDto } from './dto/cart-response.dto';

@Injectable()
export class CartService {
  constructor(
    @InjectRepository(Cart)
    private readonly cartRepo: Repository<Cart>,
    @InjectRepository(CartItem)
    private readonly cartItemRepo: Repository<CartItem>,
    @InjectRepository(ProductVariant)
    private readonly variantRepo: Repository<ProductVariant>,
  ) {}

  async getCartForUser(userId: string): Promise<CartResponseDto> {
    const cart = await this.getOrCreateCartEntity(userId);
    return this.buildCartResponse(cart.id);
  }

  private async buildCartResponse(cartId: string): Promise<CartResponseDto> {
    const items = await this.cartItemRepo.find({
      where: { cartId },
      relations: {
        variant: {
          product: { images: true },
          images: true,
          attributeValues: { attributeValue: { attribute: true } },
        },
      },
      order: { createdAt: 'ASC' },
    });
    return mapCartToResponseDto(cartId, items);
  }

  private async getOrCreateCartEntity(userId: string): Promise<Cart> {
    let cart = await this.cartRepo.findOne({ where: { userId } });
    if (!cart) {
      cart = this.cartRepo.create({ userId });
      cart = await this.cartRepo.save(cart);
    }
    return cart; 
  }

  private async resolveVariant(dto: AddCartItemDto): Promise<ProductVariant> {
    const hasId = !!dto.variantId?.trim();
    const hasSku = !!dto.sku?.trim();

    if (hasId === hasSku) {
      throw new BadRequestException(
        'Provide exactly one of variantId or sku',
      );
    }

    // No product relation needed here — only id, sku, stock are used for add logic
    const variant = hasId
      ? await this.variantRepo.findOne({ where: { id: dto.variantId } })
      : await this.variantRepo.findOne({ where: { sku: dto.sku!.trim() } });

    if (!variant) {
      throw new NotFoundException('Variant not found');
    }
    return variant;
  }

  private assertStockAvailable(variant: ProductVariant, desiredQty: number) {
    if (desiredQty > variant.stock) {
      throw new BadRequestException(
        `Insufficient stock for SKU ${variant.sku}. Available: ${variant.stock}`,
      );
    }
  }

  async addItem(userId: string, dto: AddCartItemDto): Promise<CartResponseDto> {
    const variant = await this.resolveVariant(dto);
    const cart = await this.getOrCreateCartEntity(userId);
    const qty = dto.quantity;

    let item = await this.cartItemRepo.findOne({
      where: { cartId: cart.id, variantId: variant.id },
    });

    const newQty = (item?.quantity ?? 0) + qty;
    this.assertStockAvailable(variant, newQty);

    if (item) {
      item.quantity = newQty;
      await this.cartItemRepo.save(item);
    } else {
      item = this.cartItemRepo.create({
        cartId: cart.id,
        variantId: variant.id,
        quantity: qty,
      });
      await this.cartItemRepo.save(item);
    }

    return this.buildCartResponse(cart.id);
  }

  async updateItemQuantity(
    userId: string,
    itemId: string,
    dto: UpdateCartItemDto,
  ): Promise<CartResponseDto> {
    const cart = await this.cartRepo.findOne({ where: { userId } });
    if (!cart) {
      throw new NotFoundException('Cart not found');
    }

    const item = await this.cartItemRepo.findOne({
      where: { id: itemId, cartId: cart.id },
      relations: { variant: true },
    });
    if (!item) {
      throw new NotFoundException('Cart line not found');
    }

    this.assertStockAvailable(item.variant, dto.quantity);
    item.quantity = dto.quantity;
    await this.cartItemRepo.save(item);

    return this.buildCartResponse(cart.id);
  }

  async removeItem(userId: string, itemId: string): Promise<CartResponseDto> {
    const cart = await this.cartRepo.findOne({ where: { userId } });
    if (!cart) {
      throw new NotFoundException('Cart not found');
    }

    const result = await this.cartItemRepo.delete({
      id: itemId,
      cartId: cart.id,
    });
    if (!result.affected) {
      throw new NotFoundException('Cart line not found');
    }
    return this.buildCartResponse(cart.id);
  }

  async clearCart(userId: string): Promise<CartResponseDto> {
    const cart = await this.getOrCreateCartEntity(userId);
    await this.cartItemRepo.delete({ cartId: cart.id });
    return this.buildCartResponse(cart.id);
  }
}

import {
  BadRequestException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { v4 as uuidv4 } from 'uuid';
import { DataSource, EntityManager, In, QueryRunner, SelectQueryBuilder } from 'typeorm';
import { CreateOrderDto, ShippingAddressDto } from './dto/create-order.dto';
import { UpdateOrderStatusDto } from './dto/update-order-status.dto';
import { Order } from './entities/order.entity';
import { OrderItem } from './entities/order-item.entity';
import { OrderStatusHistory } from './entities/order-status-history.entity';
import { OrderStatus } from './enums/order-status.enum';
import type { ShippingAddressSnapshot } from './types/shipping-address-override.type';
import { ProductVariant } from '../product/entities/product-variant.entity';
import { User } from '../user/entities/user.entity';
import { Address } from '../user/entities/address.entity';

const MONEY_PRECISION = 2;
const BRAND_OWNER_ROLE = 'BRAND_OWNER' as const;

const FORBIDDEN_NOT_BRAND_OWNER_LIST =
  'Only brand owners linked to a brand can list brand orders';
const FORBIDDEN_NOT_BRAND_OWNER_STATUS =
  'Only brand owners linked to a brand can update order status';

/** Allowed next statuses for each current status (fulfillment lifecycle). */
const ORDER_STATUS_ALLOWED_NEXT: Readonly<
  Record<OrderStatus, ReadonlySet<OrderStatus>>
> = {
  [OrderStatus.PENDING]: new Set([
    OrderStatus.CONFIRMED,
    OrderStatus.CANCELLED,
  ]),
  [OrderStatus.CONFIRMED]: new Set([
    OrderStatus.PROCESSING,
    OrderStatus.CANCELLED,
  ]),
  [OrderStatus.PROCESSING]: new Set([
    OrderStatus.SHIPPED,
    OrderStatus.CANCELLED,
  ]),
  [OrderStatus.SHIPPED]: new Set([OrderStatus.DELIVERED]),
  [OrderStatus.DELIVERED]: new Set(),
  [OrderStatus.CANCELLED]: new Set(),
};

function resolveLineBrandId(item: OrderItem): string | null {
  return (
    item.product?.brand?.id ?? item.variant?.product?.brand?.id ?? null
  );
}

const DEFAULT_LIMIT = 20;
const MAX_LIMIT = 100;

export interface CursorPaginationDto {
  cursor?: string;
  limit?: number;
}

export interface CursorPaginatedOrders {
  data: Order[];
  nextCursor: string | null;
  limit: number;
  hasMore: boolean;
}

@Injectable()
export class OrderService {
  constructor(private readonly dataSource: DataSource) {}

  private decodeCursor(cursor: string): { createdAt: string; id: string } {
    return JSON.parse(Buffer.from(cursor, 'base64').toString('utf8'));
  }

  private encodeCursor(row: { createdAt: Date; id: string }): string {
    return Buffer.from(
      JSON.stringify({ createdAt: row.createdAt.toISOString(), id: row.id }),
    ).toString('base64');
  }

  private normalizeCursorPagination(options?: CursorPaginationDto): {
    cursor: string | null;
    limit: number;
  } {
    return {
      cursor: options?.cursor ?? null,
      limit: Math.min(
        MAX_LIMIT,
        Math.max(1, Math.floor(options?.limit ?? DEFAULT_LIMIT)),
      ),
    };
  }

  private validateStatusTransition(
    current: OrderStatus,
    next: OrderStatus,
  ): void {
    const allowed = ORDER_STATUS_ALLOWED_NEXT[current];
    if (!allowed.has(next)) {
      throw new BadRequestException(
        `Invalid status transition from ${current} to ${next}`,
      );
    }
  }

  private addWhereOrderHasBrandProduct(
    qb: SelectQueryBuilder<Order>,
    orderEntityAlias: string,
    brandId: string,
  ): SelectQueryBuilder<Order> {
    const sub = qb
      .subQuery()
      .select('1')
      .from(OrderItem, 'oi')
      .leftJoin('oi.product', 'pd')
      .leftJoin('oi.variant', 'v')
      .leftJoin('v.product', 'pv')
      .where(`oi.orderId = ${orderEntityAlias}.id`)
      .andWhere('COALESCE(pd.brandId, pv.brandId) = :_brandOwnerBrandId')
      .getQuery();

    return qb
      .andWhere(`EXISTS (${sub})`)
      .setParameter('_brandOwnerBrandId', brandId);
  }

  private async requireBrandOwnerContext(
    em: Pick<EntityManager, 'findOne'>,
    actorUserId: string,
    forbiddenMessage: string,
  ): Promise<{ brandId: string }> {
    const actor = await em.findOne(User, {
      where: { id: actorUserId },
      select: { id: true, role: true, brandId: true },
    });
    if (!actor) {
      throw new NotFoundException('User not found');
    }
    if (actor.role !== BRAND_OWNER_ROLE || !actor.brandId) {
      throw new ForbiddenException(forbiddenMessage);
    }
    return { brandId: actor.brandId };
  }

  private toMoneyString(value: number): string {
    return (Math.round(value * 100) / 100).toFixed(MONEY_PRECISION);
  }

  private lineTotalCents(unitPrice: number, quantity: number): number {
    return Math.round(unitPrice * 100) * quantity;
  }

  private snapshotVariantAttributes(
    variant: ProductVariant,
  ): Record<string, string> | null {
    const rows = variant.attributeValues ?? [];
    if (!rows.length) return null;

    const out: Record<string, string> = {};
    for (const vav of rows) {
      const name = vav.attributeValue?.attribute?.name;
      const value = vav.attributeValue?.value;
      if (name && value !== undefined && value !== null) {
        out[name] = String(value);
      }
    }
    return Object.keys(out).length ? out : null;
  }
  private generateOrderNumber(): string {
    const datePart = new Date().toISOString().slice(0, 10).replace(/-/g, '');
    const randomPart = uuidv4().replace(/-/g, '').slice(0, 6).toUpperCase();
    return `ORD-${datePart}-${randomPart}`;
  }

  private sortStatusHistoryNewestFirst(order: Order): void {
    if (order.statusHistory?.length) {
      order.statusHistory.sort(
        (a, b) => b.changedAt.getTime() - a.changedAt.getTime(),
      );
    }
  }

  private async assertCustomerExists(
    qr: QueryRunner,
    userId: string,
  ): Promise<void> {
    const exists = await qr.manager.exists(User, { where: { id: userId } });
    if (!exists) throw new NotFoundException('User not found');
  }

  private async loadVariantsForOrderWithWriteLock(
    qr: QueryRunner,
    variantIds: string[],
  ): Promise<Map<string, ProductVariant>> {
    const variants = await qr.manager
      .createQueryBuilder(ProductVariant, 'v')
      .where('v.id IN (:...ids)', { ids: variantIds })
      .leftJoinAndSelect('v.product', 'product')
      .leftJoin('product.brand', 'brand')
      .addSelect(['brand.id', 'brand.shippingFee'])
      .leftJoinAndSelect('v.attributeValues', 'av')
      .leftJoinAndSelect('av.attributeValue', 'avv')
      .leftJoinAndSelect('avv.attribute', 'attr')
      .setLock('pessimistic_write', undefined, ['v'])
      .getMany();

    if (variants.length !== variantIds.length) {
      const found = new Set(variants.map((v) => v.id));
      const missing = variantIds.filter((id) => !found.has(id));
      throw new NotFoundException(
        `One or more variants not found: ${missing.join(', ')}`,
      );
    }

    return new Map(variants.map((v) => [v.id, v]));
  }

  private aggregateQuantitiesByVariantId(
    lines: CreateOrderDto['items'],
  ): Map<string, number> {
    const qtyByVariant = new Map<string, number>();
    for (const line of lines) {
      qtyByVariant.set(
        line.variantId,
        (qtyByVariant.get(line.variantId) ?? 0) + line.quantity,
      );
    }
    return qtyByVariant;
  }

  private validateStockAvailability(
    variantById: Map<string, ProductVariant>,
    qtyByVariant: Map<string, number>,
  ): void {
    for (const [variantId, requiredQty] of qtyByVariant) {
      const v = variantById.get(variantId)!;
      if (v.stock < requiredQty) {
        throw new BadRequestException(
          `Insufficient stock for SKU ${v.sku}. Requested: ${requiredQty}, available: ${v.stock}`,
        );
      }
    }
  }

  private resolveBrandOwnerShippingFee(
    variantById: Map<string, ProductVariant>,
  ): string {
    const firstVariant = variantById.values().next().value as
      | ProductVariant
      | undefined;
    const brand = firstVariant?.product?.brand;
    if (!brand) return (0).toFixed(MONEY_PRECISION);
    const fee = Number(brand.shippingFee ?? 0);
    return (isNaN(fee) ? 0 : fee).toFixed(MONEY_PRECISION);
  }

  private computeOrderTotalsFromDbPrices(
    lines: CreateOrderDto['items'],
    variantById: Map<string, ProductVariant>,
    shippingFeeStr: string,
  ): { subtotalStr: string; shippingFeeStr: string; totalStr: string } {
    let subtotalCents = 0;
    for (const line of lines) {
      const v = variantById.get(line.variantId)!;
      const unit = Number(v.price);
      if (Number.isNaN(unit)) {
        throw new BadRequestException(`Invalid DB price for variant ${v.id}`);
      }
      subtotalCents += this.lineTotalCents(unit, line.quantity);
    }

    const subtotalStr = (subtotalCents / 100).toFixed(MONEY_PRECISION);
    const totalStr = (subtotalCents / 100 + Number(shippingFeeStr)).toFixed(
      MONEY_PRECISION,
    );

    return { subtotalStr, shippingFeeStr, totalStr };
  }

  private buildOrderItemEntities(
    em: EntityManager,
    lines: CreateOrderDto['items'],
    variantById: Map<string, ProductVariant>,
  ): OrderItem[] {
    return lines.map((line) => {
      const v = variantById.get(line.variantId)!;
      const unit = Number(v.price);
      const unitPriceStr = this.toMoneyString(unit);

      return em.create(OrderItem, {
        productId: v.product?.id ?? null,
        variantId: v.id,
        selectedAttributes: this.snapshotVariantAttributes(v),
        unitPrice: unitPriceStr,
        quantity: line.quantity,
      });
    });
  }

  private async decrementStockGuarded(
    qr: QueryRunner,
    qtyByVariant: Map<string, number>,
  ): Promise<void> {
    for (const [variantId, deductQty] of qtyByVariant) {
      const result = await qr.manager
        .createQueryBuilder()
        .update(ProductVariant)
        .set({ stock: () => '"stock" - :qty' })
        .where('"id" = :id', { id: variantId })
        .andWhere('"stock" >= :qty')
        .setParameter('qty', deductQty)
        .execute();

      if (!result.affected || result.affected < 1) {
        throw new BadRequestException(
          `Stock no longer available for variant ${variantId}. Please retry.`,
        );
      }
    }
  }

  private assertBrandOwnershipOfEveryLine(
    ownerBrandId: string,
    items: OrderItem[],
  ): void {
    if (!items.length) {
      throw new BadRequestException('Order has no line items');
    }

    for (const item of items) {
      const lineBrandId = resolveLineBrandId(item);
      if (!lineBrandId) {
        throw new BadRequestException(
          'Cannot verify brand ownership for one or more order lines',
        );
      }
      if (lineBrandId !== ownerBrandId) {
        throw new ForbiddenException(
          'You can only update orders that contain exclusively your brand products',
        );
      }
    }
  }

  // ─── Shipping address helpers 

  /** Builds an immutable snapshot from a persisted Address row. */
  private buildOrderShippingSnapshot(addr: Address): ShippingAddressSnapshot {
    return {
      fullName: addr.fullName,
      phoneNumber: addr.phoneNumber,
      country: addr.country,
      city: addr.city,
      state: addr.state ?? null,
      postalCode: addr.postalCode,
      streetAddress: addr.streetAddress,
      addressLabel: addr.addressLabel ?? null,
    };
  }

  /**
   * Persists a new Address for the user.
   * If setAsDefault (or it is the user's first address), clears old defaults,
   * marks the new row as default, and updates users.defaultAddressId.
   * If addressLabel is not provided, auto-generates "Address N" (1-based count).
   */
  private async createAddressIfNeeded(
    queryRunner: QueryRunner,
    userId: string,
    input: ShippingAddressDto,
    setAsDefault?: boolean,
  ): Promise<Address> {
    const existingCount = await queryRunner.manager.count(Address, {
      where: { userId },
    });
    const isFirst = existingCount === 0;
    const shouldBeDefault = isFirst || setAsDefault === true;

    if (setAsDefault === true && !isFirst) {
      await queryRunner.manager.update(
        Address,
        { userId, isDefault: true },
        { isDefault: false },
      );
    }

    const addressLabel =
      input.addressLabel?.trim() || `Address ${existingCount + 1}`;

    const newAddr = queryRunner.manager.create(Address, {
      userId,
      fullName: input.fullName,
      phoneNumber: input.phoneNumber,
      country: input.country,
      city: input.city,
      state: input.state ?? null,
      postalCode: input.postalCode,
      streetAddress: input.streetAddress,
      addressLabel,
      isDefault: shouldBeDefault,
    });
    const savedAddr = await queryRunner.manager.save(Address, newAddr);

    if (shouldBeDefault) {
      await queryRunner.manager.update(
        User,
        { id: userId },
        { defaultAddressId: savedAddr.id },
      );
    }

    return savedAddr;
  }

  private async resolveShippingAddress(
    queryRunner: QueryRunner,
    userId: string,
    dto: CreateOrderDto,
  ): Promise<ShippingAddressSnapshot> {
    const hasAddressId = !!dto.addressId;
    const hasInlineAddress = !!dto.shippingAddress;

    if (!hasAddressId && !hasInlineAddress) {
      throw new BadRequestException(
        'Provide either addressId or shippingAddress',
      );
    }
    if (hasAddressId && hasInlineAddress) {
      throw new BadRequestException(
        'Provide either addressId or shippingAddress, not both',
      );
    }

    if (hasAddressId) {
      const saved = await queryRunner.manager.findOne(Address, {
        where: { id: dto.addressId, userId },
      });
      if (!saved) {
        throw new NotFoundException(
          'Shipping address not found or does not belong to you',
        );
      }
      return this.buildOrderShippingSnapshot(saved);
    }

    const savedAddr = await this.createAddressIfNeeded(
      queryRunner,
      userId,
      dto.shippingAddress!,
      dto.setAsDefault,
    );
    return this.buildOrderShippingSnapshot(savedAddr);
  }

  // ─── Public service methods ───────────────────────────────────────────────

  async createOrder(
    userId: string,
    dto: CreateOrderDto,
  ): Promise<{
    orderId: string;
    orderNumber: string;
    status: OrderStatus;
    subtotal: string;
    shippingFee: string;
    totalAmount: string;
  }> {
    const queryRunner = this.dataSource.createQueryRunner();
    await queryRunner.connect();
    await queryRunner.startTransaction();

    try {
      await this.assertCustomerExists(queryRunner, userId);

      const variantIds = [...new Set(dto.items.map((i) => i.variantId))];
      const variantById = await this.loadVariantsForOrderWithWriteLock(
        queryRunner,
        variantIds,
      );

      const qtyByVariant = this.aggregateQuantitiesByVariantId(dto.items);
      this.validateStockAvailability(variantById, qtyByVariant);

      const shippingFeeStr = this.resolveBrandOwnerShippingFee(variantById);
      const { subtotalStr, totalStr } = this.computeOrderTotalsFromDbPrices(
        dto.items,
        variantById,
        shippingFeeStr,
      );

      const orderNumber = this.generateOrderNumber();

      const shippingAddress = await this.resolveShippingAddress(
        queryRunner,
        userId,
        dto,
      );

      const orderItems = this.buildOrderItemEntities(
        queryRunner.manager,
        dto.items,
        variantById,
      );

      const initialHistory = queryRunner.manager.create(OrderStatusHistory, {
        oldStatus: null,
        newStatus: OrderStatus.PENDING,
        changedAt: new Date(),
      });

      const orderEntity = queryRunner.manager.create(Order, {
        orderNumber,
        userId,
        user: { id: userId } as User,
        shippingAddress,
        status: OrderStatus.PENDING,
        subtotal: subtotalStr,
        shippingFee: shippingFeeStr,
        totalAmount: totalStr,
        items: orderItems,
        statusHistory: [initialHistory],
      });

      const savedOrder = await queryRunner.manager.save(orderEntity);

      await this.decrementStockGuarded(queryRunner, qtyByVariant);

      await queryRunner.commitTransaction();

      return {
        orderId: savedOrder.id,
        orderNumber: savedOrder.orderNumber,
        status: savedOrder.status,
        subtotal: savedOrder.subtotal,
        shippingFee: savedOrder.shippingFee,
        totalAmount: savedOrder.totalAmount,
      };
    } catch (err) {
      if (queryRunner.isTransactionActive) {
        await queryRunner.rollbackTransaction();
      }
      throw err;
    } finally {
      await queryRunner.release();
    }
  }

  async updateOrderStatus(
    actorUserId: string,
    orderId: string,
    dto: UpdateOrderStatusDto,
  ): Promise<Order> {
    return this.dataSource.transaction(async (manager) => {
      const { brandId } = await this.requireBrandOwnerContext(
        manager,
        actorUserId,
        FORBIDDEN_NOT_BRAND_OWNER_STATUS,
      );

      const order = await manager
        .createQueryBuilder(Order, 'o')
        .where('o.id = :id', { id: orderId })
        .leftJoinAndSelect('o.items', 'item')
        .leftJoinAndSelect('item.product', 'product')
        .leftJoinAndSelect('product.brand', 'productBrand')
        .leftJoinAndSelect('item.variant', 'variant')
        .leftJoinAndSelect('variant.product', 'variantProduct')
        .leftJoinAndSelect('variantProduct.brand', 'variantProductBrand')
        .leftJoinAndSelect('o.statusHistory', 'statusHistory')
        .setLock('pessimistic_write', undefined, ['o'])
        .getOne();

      if (!order) throw new NotFoundException('Order not found');

      this.assertBrandOwnershipOfEveryLine(brandId, order.items);
      this.validateStatusTransition(order.status, dto.status);

      const previousStatus = order.status;
      order.status = dto.status;
      await manager.save(Order, order);

      const history = manager.create(OrderStatusHistory, {
        order,
        orderId: order.id,
        oldStatus: previousStatus,
        newStatus: dto.status,
        changedAt: new Date(),
      });
      const savedHistory = await manager.save(OrderStatusHistory, history);

      order.statusHistory = [...(order.statusHistory ?? []), savedHistory];
      this.sortStatusHistoryNewestFirst(order);

      return order;
    });
  }

  async getMyOrders(
    customerUserId: string,
    options?: CursorPaginationDto,
  ): Promise<CursorPaginatedOrders> {
    const { cursor, limit } = this.normalizeCursorPagination(options);

    const baseQb = this.dataSource.manager
      .createQueryBuilder(Order, 'o')
      .where('o.userId = :userId', { userId: customerUserId })
      .orderBy('o.createdAt', 'DESC')
      .addOrderBy('o.id', 'DESC')
      .take(limit + 1);

    if (cursor) {
      const decoded = this.decodeCursor(cursor);
      baseQb.andWhere('(o.createdAt, o.id) < (:createdAt, :id)', {
        createdAt: decoded.createdAt,
        id: decoded.id,
      });
    }

    const idRows = await baseQb.select(['o.id', 'o.createdAt']).getMany();
    const hasMore = idRows.length > limit;
    const paginatedRows = hasMore ? idRows.slice(0, limit) : idRows;
    const ids = paginatedRows.map((o) => o.id);

    if (!ids.length) {
      return { data: [], nextCursor: null, limit, hasMore: false };
    }

    const orders = await this.dataSource.manager.find(Order, {
      where: { id: In(ids) },
      relations: {
        items: { variant: { product: { images: true }, images: true } },
      },
    });

    const orderMap = new Map(orders.map((o) => [o.id, o]));
    const orderedData = ids
      .map((id) => orderMap.get(id))
      .filter((o): o is Order => !!o);

    let nextCursor: string | null = null;
    if (hasMore) {
      nextCursor = this.encodeCursor(paginatedRows[paginatedRows.length - 1]);
    }

    return { data: orderedData, nextCursor, limit, hasMore };
  }

  async getOrderById(
    customerUserId: string,
    orderId: string,
  ): Promise<Order> {
    const order = await this.dataSource.manager.findOne(Order, {
      where: { id: orderId, userId: customerUserId },
      relations: {
        items: { product: true, variant: { product: { images: true }, images: true } },
        statusHistory: true,
      },
    });

    if (!order) throw new NotFoundException('Order not found');

    this.sortStatusHistoryNewestFirst(order);
    return order;
  }

  async getBrandOwnerOrders(
    actorUserId: string,
    options?: CursorPaginationDto,
  ): Promise<CursorPaginatedOrders> {
    const { brandId } = await this.requireBrandOwnerContext(
      this.dataSource.manager,
      actorUserId,
      FORBIDDEN_NOT_BRAND_OWNER_LIST,
    );

    const { cursor, limit } = this.normalizeCursorPagination(options);
    const mgr = this.dataSource.manager;
    const ord = 'ord';

    const baseQb = this.addWhereOrderHasBrandProduct(
      mgr.createQueryBuilder(Order, ord),
      ord,
      brandId,
    )
      .orderBy(`${ord}.createdAt`, 'DESC')
      .addOrderBy(`${ord}.id`, 'DESC')
      .take(limit + 1);

    if (cursor) {
      const decoded = this.decodeCursor(cursor);
      baseQb.andWhere(
        `(${ord}.createdAt, ${ord}.id) < (:createdAt, :id)`,
        { createdAt: decoded.createdAt, id: decoded.id },
      );
    }

    const idRows = await baseQb
      .select([`${ord}.id`, `${ord}.createdAt`])
      .getMany();

    const hasMore = idRows.length > limit;
    const paginatedRows = hasMore ? idRows.slice(0, limit) : idRows;
    const ids = paginatedRows.map((o) => o.id);

    if (!ids.length) {
      return { data: [], nextCursor: null, limit, hasMore: false };
    }

    const rows = await mgr
      .createQueryBuilder(Order, ord)
      .leftJoinAndSelect(`${ord}.items`, 'item')
      .leftJoinAndSelect('item.variant', 'variant')
      .leftJoinAndSelect('variant.product', 'variantProduct')
      .leftJoinAndSelect('variantProduct.images', 'variantProductImages')
      .leftJoinAndSelect('variant.images', 'variantImages')
      .leftJoin(`${ord}.user`, 'customer')
      .addSelect(['customer.id', 'customer.name', 'customer.email'])
      .where(`${ord}.id IN (:...ids)`, { ids })
      .getMany();

    const byId = new Map(rows.map((o) => [o.id, o]));
    const data = ids
      .map((id) => byId.get(id))
      .filter((o): o is Order => !!o);

    let nextCursor: string | null = null;
    if (hasMore) {
      nextCursor = this.encodeCursor(paginatedRows[paginatedRows.length - 1]);
    }

    return { data, nextCursor, limit, hasMore };
  }
}

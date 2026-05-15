import {
  BadRequestException,
  ForbiddenException,
  HttpException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { DataSource, EntityManager, In, QueryRunner, SelectQueryBuilder } from 'typeorm';
import { CreateOrderDto } from './dto/create-order.dto';
import { UpdateOrderStatusDto } from './dto/update-order-status.dto';
import { Order } from './entities/order.entity';
import { OrderItem } from './entities/order-item.entity';
import { OrderStatusHistory } from './entities/order-status-history.entity';
import { OrderStatus } from './enums/order-status.enum';
import { ShippingAddressOverride } from './types/shipping-address-override.type';
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

  /**
   * Centralized status transition rules.
   */
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

  /** Snapshot map of attribute display name → value at order time. */
  private snapshotVariantAttributes(
    variant: ProductVariant,
  ): Record<string, string> | null {
    const rows = variant.attributeValues ?? [];
    if (!rows.length) {
      return null;
    }

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

  private async generateUniqueOrderNumber(
    queryRunner: QueryRunner,
  ): Promise<string> {
    const datePart = new Date()
      .toISOString()
      .slice(0, 10)
      .replace(/-/g, '');

    for (let attempt = 0; attempt < 12; attempt += 1) {
      const randomPart = Math.random().toString(36).slice(2, 8).toUpperCase();
      const orderNumber = `ORD-${datePart}-${randomPart}`;

      const exists = await queryRunner.manager.exists(Order, {
        where: { orderNumber },
      });
      if (!exists) {
        return orderNumber;
      }
    }

    throw new BadRequestException('Could not allocate unique order number');
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
    if (!exists) {
      throw new NotFoundException('User not found');
    }
  }

  /**
   * Locks variant rows for stock/price, then loads relations.
   * Postgres rejects FOR UPDATE with LEFT JOIN (TypeORM adds those for relations),
   * so locking uses a join-free query first; hydration runs in the same transaction.
   */
  private async loadVariantsForOrderWithWriteLock(
    qr: QueryRunner,
    variantIds: string[],
  ): Promise<Map<string, ProductVariant>> {
    const locked = await qr.manager
      .createQueryBuilder(ProductVariant, 'v')
      .where('v.id IN (:...ids)', { ids: variantIds })
      .setLock('pessimistic_write')
      .getMany();

    if (locked.length !== variantIds.length) {
      const found = new Set(locked.map((v) => v.id));
      const missing = variantIds.filter((id) => !found.has(id));
      throw new NotFoundException(
        `One or more variants not found: ${missing.join(', ')}`,
      );
    }

    const variants = await qr.manager.find(ProductVariant, {
      where: { id: In(variantIds) },
      relations: {
        product: true,
        attributeValues: { attributeValue: { attribute: true } },
      },
    });

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

  private computeOrderTotalsFromDbPrices(
    lines: CreateOrderDto['items'],
    variantById: Map<string, ProductVariant>,
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
    const shippingFeeStr = (0).toFixed(MONEY_PRECISION);
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
        .set({
          stock: () => '"stock" - :qty',
        })
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

  private async resolveShippingForOrder(
    queryRunner: QueryRunner,
    userId: string,
    dto: CreateOrderDto,
  ): Promise<{
    shippingAddressId: string | null;
    shippingAddressOverride: ShippingAddressOverride | null;
  }> {
    const hasAddressId = !!dto.addressId;
    const hasOverride = !!dto.shippingAddressOverride;

    if (!hasAddressId && !hasOverride) {
      throw new BadRequestException(
        'Provide either addressId or shippingAddressOverride',
      );
    }
    if (hasAddressId && hasOverride) {
      throw new BadRequestException(
        'Provide either addressId or shippingAddressOverride, not both',
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
      return { shippingAddressId: dto.addressId!, shippingAddressOverride: null };
    }

    const input = dto.shippingAddressOverride!;

    if (dto.saveAddress === true) {
      const existingCount = await queryRunner.manager.count(Address, {
        where: { userId },
      });
      const isFirst = existingCount === 0;

      const newAddr = queryRunner.manager.create(Address, {
        userId,
        fullName: input.fullName,
        phoneNumber: input.phoneNumber,
        country: input.country,
        city: input.city,
        state: input.state ?? null,
        postalCode: input.postalCode,
        streetAddress: input.streetAddress,
        isDefault: isFirst,
      });
      const savedAddr = await queryRunner.manager.save(Address, newAddr);

      if (isFirst) {
        await queryRunner.manager.update(
          User,
          { id: userId },
          { defaultAddressId: savedAddr.id },
        );
      }

      return { shippingAddressId: savedAddr.id, shippingAddressOverride: null };
    }

    return {
      shippingAddressId: null,
      shippingAddressOverride: {
        fullName: input.fullName,
        phoneNumber: input.phoneNumber,
        country: input.country,
        city: input.city,
        state: input.state ?? null,
        postalCode: input.postalCode,
        streetAddress: input.streetAddress,
      },
    };
  }

  buildShippingAddressPayload(
    order: Order,
  ): ShippingAddressOverride | null {
    if (order.shippingAddressOverride) {
      return order.shippingAddressOverride;
    }
    if (order.shippingAddress) {
      const a = order.shippingAddress;
      return {
        fullName: a.fullName,
        phoneNumber: a.phoneNumber,
        country: a.country,
        city: a.city,
        state: a.state ?? null,
        postalCode: a.postalCode,
        streetAddress: a.streetAddress,
      };
    }
    return null;
  }

  /**
   * Creates an order from validated DTO input. Prices and stock are enforced from DB only.
   */
  async createOrder(userId: string, dto: CreateOrderDto): Promise<{
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

      const { subtotalStr, shippingFeeStr, totalStr } =
        this.computeOrderTotalsFromDbPrices(dto.items, variantById);

      const orderNumber = await this.generateUniqueOrderNumber(queryRunner);

      const { shippingAddressId, shippingAddressOverride } =
        await this.resolveShippingForOrder(queryRunner, userId, dto);

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
        shippingAddressId: shippingAddressId ?? null,
        shippingAddressOverride: shippingAddressOverride ?? null,
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
      if (err instanceof HttpException) {
        throw err;
      }
      throw err;
    } finally {
      await queryRunner.release();
    }
  }

  /**
   * Brand owners may advance/cancel fulfillment only for orders made entirely of their brand's products.
   * Updates status and appends {@link OrderStatusHistory} in one transaction.
   */
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

      const locked = await manager
        .createQueryBuilder(Order, 'o')
        .where('o.id = :id', { id: orderId })
        .setLock('pessimistic_write')
        .getOne();

      if (!locked) {
        throw new NotFoundException('Order not found');
      }

      const order = await manager.findOne(Order, {
        where: { id: orderId },
        relations: {
          items: {
            product: { brand: true },
            variant: { product: { brand: true } },
          },
          shippingAddress: true,
          statusHistory: true,
        },
      });

      if (!order) {
        throw new NotFoundException('Order not found');
      }

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

      order.statusHistory = [
        ...(order.statusHistory ?? []),
        savedHistory,
      ];
      this.sortStatusHistoryNewestFirst(order);

      return order;
    });
  }


async getMyOrders(
  customerUserId: string,
  options?: CursorPaginationDto,
): Promise<CursorPaginatedOrders> {
  const { cursor, limit } =
    this.normalizeCursorPagination(options);

  const baseQb = this.dataSource.manager
    .createQueryBuilder(Order, 'o')
    .where('o.userId = :userId', {
      userId: customerUserId,
    })
    .orderBy('o.createdAt', 'DESC')
    .addOrderBy('o.id', 'DESC')
    .take(limit + 1);

  if (cursor) {
    const decoded = JSON.parse(
      Buffer.from(cursor, 'base64').toString('utf8'),
    ) as {
      createdAt: string;
      id: string;
    };

    baseQb.andWhere(
      '(o.createdAt, o.id) < (:createdAt, :id)',
      {
        createdAt: decoded.createdAt,
        id: decoded.id,
      },
    );
  }

  const idRows = await baseQb
    .select(['o.id', 'o.createdAt'])
    .getMany();

  const hasMore = idRows.length > limit;

  const paginatedRows = hasMore
    ? idRows.slice(0, limit)
    : idRows;

  const ids = paginatedRows.map((o) => o.id);

  if (!ids.length) {
    return {
      data: [],
      nextCursor: null,
      limit,
      hasMore: false,
    };
  }

  const orders = await this.dataSource.manager.find(Order, {
    where: {
      id: In(ids),
    },
    relations: {
      items: { variant: { product: { images: true }, images: true } },
      shippingAddress: true,
    },
  });

  const orderMap = new Map(
    orders.map((o) => [o.id, o]),
  );

  const orderedData = ids
    .map((id) => orderMap.get(id))
    .filter((o): o is Order => !!o);

  let nextCursor: string | null = null;

  if (hasMore) {
    const last = paginatedRows[paginatedRows.length - 1];

    nextCursor = Buffer.from(
      JSON.stringify({
        createdAt: last.createdAt.toISOString(),
        id: last.id,
      }),
    ).toString('base64');
  }

  return {
    data: orderedData,
    nextCursor,
    limit,
    hasMore,
  };
}
 
  async getOrderById(
    customerUserId: string,
    orderId: string,
  ): Promise<Order> {
    const order = await this.dataSource.manager.findOne(Order, {
      where: { id: orderId, userId: customerUserId },
      relations: {
        items: { product: true, variant: { product: { images: true }, images: true } },
        shippingAddress: true,
        statusHistory: true,
      },
    });

    if (!order) {
      throw new NotFoundException('Order not found');
    }

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

  const { cursor, limit } =
    this.normalizeCursorPagination(options);

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
    const decoded = JSON.parse(
      Buffer.from(cursor, 'base64').toString('utf8'),
    ) as {
      createdAt: string;
      id: string;
    };

    baseQb.andWhere(
      `(${ord}.createdAt, ${ord}.id) < (:createdAt, :id)`,
      {
        createdAt: decoded.createdAt,
        id: decoded.id,
      },
    );
  }

  const idRows = await baseQb
    .select([`${ord}.id`, `${ord}.createdAt`])
    .getMany();

  const hasMore = idRows.length > limit;

  const paginatedRows = hasMore
    ? idRows.slice(0, limit)
    : idRows;

  const ids = paginatedRows.map((o) => o.id);

  if (!ids.length) {
    return {
      data: [],
      nextCursor: null,
      limit,
      hasMore: false,
    };
  }


  const rows = await mgr
    .createQueryBuilder(Order, ord)
    .leftJoinAndSelect(`${ord}.items`, 'item')
    .leftJoinAndSelect('item.variant', 'variant')
    .leftJoinAndSelect('variant.product', 'variantProduct')
    .leftJoinAndSelect('variantProduct.images', 'variantProductImages')
    .leftJoinAndSelect('variant.images', 'variantImages')
    .leftJoinAndSelect(`${ord}.shippingAddress`, 'ship')
    .leftJoin(`${ord}.user`, 'customer')
    .addSelect([
      'customer.id',
      'customer.name',
      'customer.email',
    ])
    .where(`${ord}.id IN (:...ids)`, { ids })
    .getMany();


  const byId = new Map(rows.map((o) => [o.id, o]));

  const data = ids
    .map((id) => byId.get(id))
    .filter((o): o is Order => !!o);

  let nextCursor: string | null = null;

  if (hasMore) {
    const last =
      paginatedRows[paginatedRows.length - 1];

    nextCursor = Buffer.from(
      JSON.stringify({
        createdAt: last.createdAt.toISOString(),
        id: last.id,
      }),
    ).toString('base64');
  }

  return {
    data,
    nextCursor,
    limit,
    hasMore,
  };
}
}

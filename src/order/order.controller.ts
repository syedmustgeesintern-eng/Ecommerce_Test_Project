import {
  Body,
  Controller,
  DefaultValuePipe,
  Get,
  Param,
  ParseIntPipe,
  ParseUUIDPipe,
  Patch,
  Post,
  Query,
  UseGuards,
} from '@nestjs/common';
import { OrderService } from './order.service';
import { CreateOrderDto } from './dto/create-order.dto';
import { UpdateOrderStatusDto } from './dto/update-order-status.dto';
import { JwtAuthGuard } from '../utils/guards/jwt-auth.guard';
import { RolesGuard } from '../utils/guards/roles.guard';
import { Roles } from '../utils/decorators/roles/roles.decorator';
import { CurrentUser } from '../utils/decorators/current-user/current-user.decorator';
import { Role } from '../utils/enums/role.enum';
import type { JwtUser } from '../utils/types/jwt-user.type';

const uuidPipe = new ParseUUIDPipe({ version: '4' });

@Controller('orders')
@UseGuards(JwtAuthGuard)
export class OrderController {
  constructor(private readonly orderService: OrderService) {}

  @Post()
  create(@CurrentUser() user: JwtUser, @Body() dto: CreateOrderDto) {
    return this.orderService.createOrder(user.userId, dto);
  }

  @Get('my-orders')
  getMyOrders(
    @CurrentUser() user: JwtUser,
    @Query('cursor') cursor?: string,
    @Query('limit', new DefaultValuePipe(20), ParseIntPipe)
    limit?: number,
  ) {
    return this.orderService.getMyOrders(user.userId, {
      cursor,
      limit,
    });
  }
  @Get('brand-owner/orders')
  getBrandOwnerOrders(
    @CurrentUser() user: JwtUser,
    @Query('cursor') cursor?: string,
    @Query('limit', new DefaultValuePipe(20), ParseIntPipe)
    limit?: number,
  ) {
    return this.orderService.getBrandOwnerOrders(user.userId, {
      cursor,
      limit,
    });
  }

  @Patch(':id/status')
  @UseGuards(RolesGuard)
  @Roles(Role.BRAND_OWNER)
  updateStatus(
    @CurrentUser() user: JwtUser,
    @Param('id', uuidPipe) orderId: string,
    @Body() dto: UpdateOrderStatusDto,
  ) {
    return this.orderService.updateOrderStatus(user.userId, orderId, dto);
  }

  @Get(':id')
  getById(
    @CurrentUser() user: JwtUser,
    @Param('id', uuidPipe) orderId: string,
  ) {
    return this.orderService.getOrderById(user.userId, orderId);
  }
}

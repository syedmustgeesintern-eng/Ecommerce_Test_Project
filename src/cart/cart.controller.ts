import {
  Body,
  Controller,
  Delete,
  Get,
  Param,
  ParseUUIDPipe,
  Patch,
  Post,
  UseGuards,
} from '@nestjs/common';
import { CartService } from './cart.service';
import { JwtAuthGuard } from '../utils/guards/jwt-auth.guard';
import { CurrentUser } from '../utils/decorators/current-user/current-user.decorator';
import type { JwtUser } from '../utils/types/jwt-user.type';
import { AddCartItemDto } from './dto/add-cart-item.dto';
import { UpdateCartItemDto } from './dto/update-cart-item.dto';

@Controller('cart')
@UseGuards(JwtAuthGuard)
export class CartController {
  constructor(private readonly cartService: CartService) {}

  @Get()
  getCart(@CurrentUser() user: JwtUser) {
    return this.cartService.getCartForUser(user.userId);
  }

  @Post('items')
  addItem(@CurrentUser() user: JwtUser, @Body() dto: AddCartItemDto) {
    return this.cartService.addItem(user.userId, dto);
  }

  @Patch('items/:itemId')
  updateItem(
    @CurrentUser() user: JwtUser,
    @Param('itemId', ParseUUIDPipe) itemId: string,
    @Body() dto: UpdateCartItemDto,
  ) {
    return this.cartService.updateItemQuantity(user.userId, itemId, dto);
  }

  @Delete('items/:itemId')
  removeItem(
    @CurrentUser() user: JwtUser,
    @Param('itemId', ParseUUIDPipe) itemId: string,
  ) {
    return this.cartService.removeItem(user.userId, itemId);
  }

  @Delete()
  clearCart(@CurrentUser() user: JwtUser) {
    return this.cartService.clearCart(user.userId);
  }
}

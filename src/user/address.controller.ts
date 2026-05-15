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
import { JwtAuthGuard } from '../utils/guards/jwt-auth.guard';
import { CurrentUser } from '../utils/decorators/current-user/current-user.decorator';
import type { JwtUser } from '../utils/types/jwt-user.type';
import { AddressService } from './address.service';
import { CreateAddressDto } from './dto/create-address.dto';
import { UpdateAddressDto } from './dto/update-address.dto';

@UseGuards(JwtAuthGuard)
@Controller('users/addresses')
export class AddressController {
  constructor(private readonly addressService: AddressService) {}

  @Post()
  create(@CurrentUser() user: JwtUser, @Body() dto: CreateAddressDto) {
    return this.addressService.createAddress(user.userId, dto);
  }

  @Get()
  getAll(@CurrentUser() user: JwtUser) {
    return this.addressService.getMyAddresses(user.userId);
  }
  @Get('default')
  getDefault(@CurrentUser() user: JwtUser) {
    return this.addressService.getDefaultAddress(user.userId);
  }
  @Get(':id')
  getOne(@CurrentUser() user: JwtUser, @Param('id', ParseUUIDPipe) id: string) {
    return this.addressService.getAddressById(user.userId, id);
  }

  @Patch(':id')
  update(
    @CurrentUser() user: JwtUser,
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: UpdateAddressDto,
  ) {
    return this.addressService.updateAddress(user.userId, id, dto);
  }

  @Delete(':id')
  remove(@CurrentUser() user: JwtUser, @Param('id', ParseUUIDPipe) id: string) {
    return this.addressService.deleteAddress(user.userId, id);
  }

  @Patch(':id/default')
  setDefault(
    @CurrentUser() user: JwtUser,
    @Param('id', ParseUUIDPipe) id: string,
  ) {
    return this.addressService.setDefaultAddress(user.userId, id);
  }
}

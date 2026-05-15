import { Module } from '@nestjs/common';
import { UserService } from './user.service';
import { UserController } from './user.controller';
import { AddressService } from './address.service';
import { AddressController } from './address.controller';
import { TypeOrmModule } from '@nestjs/typeorm';
import { User } from './entities/user.entity';
import { Address } from './entities/address.entity';
import { Brand } from '../brand/entities/brand.entity';

@Module({
  imports: [TypeOrmModule.forFeature([User, Address, Brand])],
  controllers: [UserController, AddressController],
  providers: [UserService, AddressService],
  exports: [UserService, AddressService],
})
export class UserModule {}

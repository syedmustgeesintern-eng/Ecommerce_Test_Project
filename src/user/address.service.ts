import {
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { DataSource } from 'typeorm';
import { Address } from './entities/address.entity';
import { User } from './entities/user.entity';
import { CreateAddressDto } from './dto/create-address.dto';
import { UpdateAddressDto } from './dto/update-address.dto';

@Injectable()
export class AddressService {
  constructor(private readonly dataSource: DataSource) {}

  async createAddress(userId: string, dto: CreateAddressDto): Promise<Address> {
    return this.dataSource.transaction(async (manager) => {
      const existingCount = await manager.count(Address, {
        where: { userId },
      });

     
      const shouldBeDefault = existingCount === 0 || dto.isDefault === true;

      if (shouldBeDefault) {
        await manager.update(
          Address,
          { userId, isDefault: true },
          { isDefault: false },
        );
      }

      const address = manager.create(Address, {
        userId,
        fullName: dto.fullName,
        phoneNumber: dto.phoneNumber,
        country: dto.country,
        city: dto.city,
        state: dto.state ?? null,
        postalCode: dto.postalCode,
        streetAddress: dto.streetAddress,
        addressLabel: dto.addressLabel ?? null,
        isDefault: shouldBeDefault,
      });

      const saved = await manager.save(Address, address);

      if (shouldBeDefault) {
        await manager.update(
          User,
          { id: userId },
          { defaultAddressId: saved.id },
        );
      }

      return saved;
    });
  }

  async getMyAddresses(userId: string): Promise<Address[]> {
    return this.dataSource.manager
      .createQueryBuilder(Address, 'a')
      .where('a.userId = :userId', { userId })
      .orderBy('a.isDefault', 'DESC')
      .addOrderBy('a.createdAt', 'ASC')
      .getMany();
  }

  async getAddressById(userId: string, addressId: string): Promise<Address> {
    const address = await this.dataSource.manager.findOne(Address, {
      where: { id: addressId },
    });

    if (!address) throw new NotFoundException('Address not found');
    this.assertOwnership(address, userId);

    return address;
  }

  async updateAddress(
    userId: string,
    addressId: string,
    dto: UpdateAddressDto,
  ): Promise<Address> {
    return this.dataSource.transaction(async (manager) => {
      const address = await manager.findOne(Address, {
        where: { id: addressId },
      });
      if (!address) throw new NotFoundException('Address not found');
      this.assertOwnership(address, userId);

      if (dto.isDefault === true && !address.isDefault) {
        await manager.update(
          Address,
          { userId, isDefault: true },
          { isDefault: false },
        );
        await manager.update(
          User,
          { id: userId },
          { defaultAddressId: addressId },
        );
      }

      Object.assign(address, dto);
      return manager.save(Address, address);
    });
  }

  async deleteAddress(
    userId: string,
    addressId: string,
  ): Promise<{ message: string }> {
    await this.dataSource.transaction(async (manager) => {
      const address = await manager.findOne(Address, {
        where: { id: addressId },
      });

      if (!address) {
        throw new NotFoundException('Address not found');
      }

      this.assertOwnership(address, userId);

      const wasDefault = address.isDefault;

      await manager.remove(Address, address);

      if (wasDefault) {
        // Promote the oldest remaining address to default
        const next = await manager.findOne(Address, {
          where: { userId },
          order: { createdAt: 'ASC' },
        });

        await manager.update(
          User,
          { id: userId },
          { defaultAddressId: next?.id ?? null },
        );

        if (next) {
          await manager.update(Address, { id: next.id }, { isDefault: true });
        }
      }
    });

    return {
      message: 'Address deleted successfully',
    };
  }
  async setDefaultAddress(userId: string, addressId: string): Promise<Address> {
    return this.dataSource.transaction(async (manager) => {
      const address = await manager.findOne(Address, {
        where: { id: addressId },
      });
      if (!address) throw new NotFoundException('Address not found');
      this.assertOwnership(address, userId);

      // Atomically unset old default and set new one
      await manager.update(
        Address,
        { userId, isDefault: true },
        { isDefault: false },
      );
      await manager.update(Address, { id: addressId }, { isDefault: true });
      await manager.update(
        User,
        { id: userId },
        { defaultAddressId: addressId },
      );

      return { ...address, isDefault: true };
    });
  }

  private assertOwnership(address: Address, userId: string): void {
    if (address.userId !== userId) {
      throw new ForbiddenException('You do not have access to this address');
    }
  }
  async getDefaultAddress(userId: string): Promise<Address> {
    const address = await this.dataSource.manager.findOne(Address, {
      where: {
        userId,
        isDefault: true,
      },
    });

    if (!address) {
      throw new NotFoundException('Default address not found');
    }

    return address;
  }
}

import {
  Injectable,
  NotFoundException,
  BadRequestException,
  InternalServerErrorException,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { MoreThan, Repository } from 'typeorm';
import { User } from './entities/user.entity';
import { CreateUserDto } from './dto/create-user.dto';
import { UpdateUserDto } from './dto/update-user.dto';

@Injectable()
export class UserService {
  constructor(
    @InjectRepository(User)
    private userRepo: Repository<User>,
  ) {}
  create(createUserDto: CreateUserDto) {
    return 'This action adds a new user';
  }

  async createBrandOwnerUser(email: string, password: string, brandId: string) {
    const user = this.userRepo.create({
      name: null,
      email,
      password,
      role: 'BRAND_OWNER',
      brandId,
    });

    return await this.userRepo.save(user);
  }
  async findByEmail(email: string) {
    const user = await this.userRepo.findOne({
      where: { email },
    });

    return user;
  }
  async findById(userId: string) {
    const user = await this.userRepo.findOne({
      where: { id: userId },
    });
    if (!user) {
      throw new BadRequestException('User Not Found');
    }
    return user;
  }
  async createCustomerUser(dto: any, hashedPassword: string) {
    const user = this.userRepo.create({
      name: dto.name,
      email: dto.email,
      password: hashedPassword,
      role: 'CUSTOMER',
    });

    return await this.userRepo.save(user);
  }

  async getAllUsers(limit: number, cursor?: string) {
    try {
      const take = Number(limit);

      if (isNaN(take) || take <= 0) {
        throw new BadRequestException('Invalid limit');
      }

      const users = await this.userRepo.find({
        where: cursor ? { created_at: MoreThan(new Date(cursor)) } : {},
        order: { created_at: 'ASC' },
        take: take + 1,
        select: {
          id: true,
          email: true,
          role: true,
          brandId: true,
          created_at: true,
        },
      });

      const hasNext = users.length > take;
      const data = hasNext ? users.slice(0, -1) : users;

      return {
        data,
        nextCursor: hasNext ? users[users.length - 1].created_at : null,
      };
    } catch (error) {
      throw new InternalServerErrorException('Failed to fetch users');
    }
  }

  async getMe(user: any) {
    const dbUser = await this.userRepo.findOne({
      where: { id: user.userId },
      select: ['id', 'name', 'email', 'role', 'brandId'],
    });

    if (!dbUser) {
      throw new NotFoundException('User not found');
    }

    return dbUser;
  }

  findOne(id: number) {
    return `This action returns a #${id} user`;
  }

  update(id: number, updateUserDto: UpdateUserDto) {
    return `This action updates a #${id} user`;
  }

  remove(id: number) {
    return `This action removes a #${id} user`;
  }

  async updateResetToken(userId: string, token: string, expiry: Date) {
    await this.userRepo.update(userId, {
      resetToken: token,
      resetTokenExpiry: expiry,
    });
  }

  async findByResetToken(token: string) {
    const user = await this.userRepo.findOne({
      where: { resetToken: token },
    });

    if (!user) {
      throw new BadRequestException('Invalid token');
    }

    if (!user.resetTokenExpiry) {
      throw new BadRequestException('Invalid token');
    }

    if (user.resetTokenExpiry < new Date()) {
      throw new BadRequestException('Token expired');
    }

    return user;
  }

  async clearResetToken(userId: string) {
    await this.userRepo.update(userId, {
      resetToken: null,
      resetTokenExpiry: null,
    });
  }

  async updatePassword(userId: string, password: string) {
    await this.userRepo.update(userId, { password });
  }

  async updateUserInfo(userId: string, dto: UpdateUserDto) {
    if (!userId) {
      throw new BadRequestException('Invalid user ID');
    }

    const user = await this.userRepo.findOne({
      where: { id: userId },
    });

    if (!user) {
      throw new NotFoundException('User not found');
    }

    Object.assign(user, dto);

    await this.userRepo.save(user);

    return {
      message: 'User updated successfully',
      data: user,
    };
  }
}

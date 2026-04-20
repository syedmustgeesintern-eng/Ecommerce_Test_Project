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


  async getAllUsers(limit: number, cursor?: string) {
    try {
      const take = Number(limit);

      if (isNaN(take) || take <= 0) {
        throw new BadRequestException('Invalid limit');
      }

      const users = await this.userRepo.find({
        where: cursor
          ? { created_at: MoreThan(new Date(cursor)) }
          : {},
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
        nextCursor: hasNext
          ? users[users.length - 1].created_at
          : null,
      };
    } catch (error) {
      throw new InternalServerErrorException('Failed to fetch users');
    }
  }

  async getMe(user: any) {
    const dbUser = await this.userRepo.findOne({
      where: { id: user.userId },
      select: ['id', 'email', 'role', 'brandId'],
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
}

import {
  ConflictException,
  Injectable,
  InternalServerErrorException,
  NotFoundException,
  UnauthorizedException,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { MoreThan, Repository } from 'typeorm';
import { RegisterBrandDto } from './dto/register-brand.dto';
import { Brand } from './entities/brand.entity';
import { hashPassword } from '../utils/bcrypt.util';
import { generateOtp, generateTempPassword } from '../utils/generate.utils';
import { MailerService } from '../libs/mail/mailer.service';
import { RedisService } from '../libs/redis/redis.service';
import { S3Service } from '../libs/s3/s3.service';
import { cleanValue } from 'src/utils/helperFunction';
import { UserService } from 'src/user/user.service';
import { UpdateBrandDto } from './dto/update-brand.dto';
import { JwtUser } from 'src/utils/types/jwt-user.type';

@Injectable()
export class BrandService {
  constructor(
    @InjectRepository(Brand)
    private brandRepo: Repository<Brand>,
    private userService: UserService,

    private mailerService: MailerService,
    private redisService: RedisService,
    private s3Service: S3Service,
  ) {}

  // STEP 1: REGISTER BRAND (OTP ONLY)
  async registerBrand(dto: RegisterBrandDto, file: Express.Multer.File) {
    try {
      const existingBrand = await this.brandRepo.findOne({
        where: { email: dto.email },
      });

      if (existingBrand) {
        throw new ConflictException('Brand already exists with this email');
      }

      const otp = generateOtp();
      let logoUrl: string | null = null;
      if (file) {
        console.log(file.size);
        logoUrl = await this.s3Service.uploadFile(file);
      }
      const payload = {
        type: 'BRAND',
        otp,
        dto: { ...dto, logoUrl },
      };

await this.redisService.set(`otp:${dto.email}`, payload, 43200);

      this.mailerService.sendBrandOtp(dto.email, otp);

      return { message: 'OTP sent to email' };
    } catch (error) {
      // ✅ IMPORTANT: rethrow known errors
      if (error instanceof ConflictException) throw error;

      throw new InternalServerErrorException('Failed to register brand');
    }
  }

  // STEP 2: VERIFY OTP + CREATE BRAND + USER
  async createBrandAfterOtp(record: any) {
    const existingBrand = await this.brandRepo.findOne({
      where: { email: record.dto.email },
    });
    if (existingBrand) {
      throw new ConflictException('Brand already exists');
    }
    const tempPassword = generateTempPassword();
    const brand = this.brandRepo.create({
      name: record.dto.name,
      email: record.dto.email,
      phone: record.dto.phone,
      support_email: record.dto.supportEmail ?? null,
      logo_url: cleanValue(record.dto.logoUrl),
      status: 'ACTIVE',
    });
    const savedBrand = await this.brandRepo.save(brand);

    const hashedPassword = await hashPassword(tempPassword);

    await this.userService.createBrandOwnerUser(
      record.dto.email,
      hashedPassword,
      savedBrand.id,
    );

    await this.mailerService.sendTempPassword(record.dto.email, tempPassword);

    await this.redisService.del(record.dto.email);

    return {
      message: 'Brand created successfully',
    };
  }

  async getAllBrands(limit: number, cursor?: string) {
    const take = Number(limit);

    const brands = await this.brandRepo.find({
      where: cursor ? { created_at: MoreThan(new Date(cursor)) } : {},
      order: { created_at: 'ASC' },
      take: take + 1,
    });

    const hasNext = brands.length > take;
    const data = hasNext ? brands.slice(0, -1) : brands;

    return {
      data,
      nextCursor: hasNext ? brands[brands.length - 1].created_at : null,
    };
  }

  async getBrandDashboard(user: any) {
    const brand = await this.brandRepo.findOne({
      where: { id: user.brandId },
    });

    if (!brand) {
      throw new Error('Brand not found or unauthorized');
    }

    return {
      message: 'Brand data fetched successfully',
      brand,
    };
  }
  async getPublicBrand(id: string) {
    const brand = await this.brandRepo.findOne({
      where: { id },
      select: {
        id: true,
        name: true,
        logo_url: true,
        support_email: true,
      },
    });

    if (!brand) {
      throw new NotFoundException('Brand not found');
    }

    return brand;
  }

  async getMyBrand(user: any) {
    const brand = await this.brandRepo.findOne({
      where: { id: user.brandId },
    });

    if (!brand) {
      throw new UnauthorizedException('Unauthorized');
    }

    return brand;
  }
  async updateBrand(
    brandId: string,
    dto: UpdateBrandDto,
    user: JwtUser,
    file?: Express.Multer.File,
  ) {
    const brand = await this.brandRepo.findOne({
      where: { id: brandId },
    });

    if (!brand) {
      throw new NotFoundException('Brand not found');
    }

    if (user.brandId !== brandId) {
      throw new UnauthorizedException('You can only update your own brand');
    }

    let logoUrl: string | undefined;

    if (file) {
      logoUrl = await this.s3Service.uploadFile(file);
    }

    const updatedBrand = {
      ...brand,
      ...dto,
      logo_url: logoUrl ?? brand.logo_url,
      support_email: dto.supportEmail ?? brand.support_email,
    };

    await this.brandRepo.save(updatedBrand);

    return {
      message: 'Brand updated successfully',
      data: updatedBrand,
    };
  }
}

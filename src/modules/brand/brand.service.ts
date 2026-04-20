import { BadRequestException, ConflictException, Injectable, InternalServerErrorException, NotFoundException, UnauthorizedException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { MoreThan, Repository } from 'typeorm';

import { RegisterBrandDto } from './dto/register-brand.dto';
import { Brand } from './entities/brand.entity';
import { User } from '../user/entities/user.entity';

import { hashPassword } from '../../utils/bcrypt.util';
import { generateOtp, generateTempPassword } from '../../utils/generate.utils';

import { MailerService } from '../mail/mailer.service';
import { RedisService } from '../redis/redis.service';
import { S3Service } from '../s3/s3.service';

@Injectable()
export class BrandService {
  constructor(
    @InjectRepository(Brand)
    private brandRepo: Repository<Brand>,

    @InjectRepository(User)
    private userRepo: Repository<User>,

    private mailerService: MailerService,
    private redisService: RedisService,
    private s3Service: S3Service
  ) {}

  // ==============================
  // STEP 1: REGISTER BRAND (OTP ONLY)
  // ==============================
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
console.time('S3');
    if (file) {
      console.log(file.size);
      logoUrl = await this.s3Service.uploadFile(file);
    }
console.timeEnd('S3');
    const payload = {
      otp,
      dto: { ...dto, logoUrl },
    };
console.time('REDIS');
    await this.redisService.set(dto.email, payload, 43200);
console.timeEnd('REDIS');
console.time('MAIL');
     this.mailerService.sendBrandOtp(dto.email, otp);
console.timeEnd('MAIL');
    return { message: 'OTP sent to email' };
  } catch (error) {
    // ✅ IMPORTANT: rethrow known errors
    if (error instanceof ConflictException) throw error;

    throw new InternalServerErrorException('Failed to register brand');
  }
}


  // STEP 2: VERIFY OTP + CREATE BRAND + USER
async verifyOtp(email: string, otp: string) {
  try {
    const record = await this.redisService.get(email);

    if (!record) {
      throw new BadRequestException('Invalid or expired OTP');
    }

    if (record.otp !== otp) {
      throw new BadRequestException('Invalid OTP');
    }

    const tempPassword = generateTempPassword();

    const brand = this.brandRepo.create({
      name: record.dto.brandName,
      email: record.dto.email,
      phone: record.dto.phone,
      support_email: record.dto.supportEmail,
      logo_url: record.dto.logoUrl,
      status: 'ACTIVE',
    });

    const savedBrand = await this.brandRepo.save(brand);

    const hashedPassword = await hashPassword(tempPassword);

    const user = this.userRepo.create({
      name: null,
      email: record.dto.email,
      password: hashedPassword,
      role: 'BRAND_OWNER',
      brandId: savedBrand.id,
    });

    await this.userRepo.save(user);

    await this.mailerService.sendTempPassword(email, tempPassword);

    await this.redisService.del(email);

    return {
      message: 'Brand created successfully. Check email for password.',
    };
  } catch (error) {
    if (error instanceof BadRequestException) throw error;

    throw new InternalServerErrorException('OTP verification failed');
  }
}

async getAllBrands(limit: number, cursor?: string) {
  const take = Number(limit);

  const brands = await this.brandRepo.find({
    where: cursor
      ? { created_at: MoreThan(new Date(cursor)) }
      : {},
    order: { created_at: 'ASC' },
    take: take + 1,
  });

  const hasNext = brands.length > take;
  const data = hasNext ? brands.slice(0, -1) : brands;

  return {
    data,
    nextCursor: hasNext
      ? brands[brands.length - 1].created_at
      : null,
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

}

import { BadRequestException, ConflictException, Injectable, InternalServerErrorException, UnauthorizedException } from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';

import { User } from '../user/entities/user.entity';
import { comparePassword, hashPassword } from '../../utils/bcrypt.util';
import { ConfigService } from '@nestjs/config';
import { SignupCustomerDto } from '../user/dto/signup-customer.dto';
import { generateOtp } from 'src/utils/generate.utils';
import { RedisService } from '../redis/redis.service';
import { MailerService } from '../mail/mailer.service';

@Injectable()
export class AuthService {
  constructor(
    @InjectRepository(User)
    private userRepo: Repository<User>,
    private jwtService: JwtService,
    private redisService: RedisService,
    private mailerService: MailerService,
    private configService: ConfigService,
  ) {}

  // LOGIN
async login(email: string, password: string) {
  try {
    const user = await this.userRepo.findOne({ where: { email } });

    if (!user) throw new UnauthorizedException('Invalid credentials');

    const isMatch = await comparePassword(password, user.password);

    if (!isMatch) throw new UnauthorizedException('Invalid credentials');

    const payload = {
      sub: user.id,
      email: user.email,
      role: user.role,
      brandId: user.brandId,
    };

    const accessToken = this.jwtService.sign(payload, {
      secret: this.configService.getOrThrow('JWT_SECRET'),
      expiresIn: this.configService.getOrThrow('JWT_ACCESS_EXPIRES_IN') as any,
    });

    const refreshToken = this.jwtService.sign(payload, {
      secret: this.configService.getOrThrow('JWT_SECRET'),
      expiresIn: this.configService.getOrThrow('JWT_REFRESH_EXPIRES_IN') as any,
    });

    return { accessToken, refreshToken };
  } catch (error) {
    if (error instanceof UnauthorizedException) throw error;

    throw new InternalServerErrorException('Login failed');
  }
}

  // REFRESH TOKEN
  async refreshToken(token: string) {
    try {
      const payload = this.jwtService.verify(token, {
        secret: process.env.JWT_SECRET,
      });

   const newAccessToken = this.jwtService.sign(
  {
    sub: payload.sub,
    email: payload.email,
    role: payload.role,
    brandId: payload.brandId,
  },
  {
    secret: this.configService.getOrThrow<string>('JWT_SECRET'),
    expiresIn: this.configService.getOrThrow<string>('JWT_ACCESS_EXPIRES_IN') as any,
  },
);
      return {
        accessToken: newAccessToken,
      };
    } catch (err) {
      throw new UnauthorizedException('Invalid refresh token');
    }
  }
  //create customer user
async signupCustomer(dto: SignupCustomerDto) {
  const existingUser = await this.userRepo.findOne({
    where: { email: dto.email },
  });

  if (existingUser) {
    throw new ConflictException('User already exists with this email');
  }

  const otp = generateOtp();

  const payload = {
    otp,
    dto,
  };

  await this.redisService.set(dto.email, payload, 43200);

  await this.mailerService.sendOtp(dto.email, otp);

  return {
    message: 'OTP sent to email',
  };
}
async verifyCustomerOtp(email: string, otp: string) {
  const record = await this.redisService.get(email);

  if (!record) {
    throw new BadRequestException('Invalid or expired OTP');
  }

  if (record.otp !== otp) {
    throw new BadRequestException('Invalid OTP');
  }

  const hashedPassword = await hashPassword(record.dto.password);

  const user = this.userRepo.create({
    name: record.dto.name,
    email: record.dto.email,
    password: hashedPassword,
    role: 'CUSTOMER',
  });

  await this.userRepo.save(user);

  await this.redisService.del(email);

  return {
    message: 'Customer created successfully',
  };
}



}

import { BadRequestException, ConflictException, Injectable, InternalServerErrorException, UnauthorizedException } from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import { comparePassword, hashPassword } from '../utils/bcrypt.util';
import { ConfigService } from '@nestjs/config';
import { generateOtp } from 'src/utils/generate.utils';
import { RedisService } from '../libs/redis/redis.service';
import { MailerService } from '../libs/mail/mailer.service';
import { BrandService } from '../brand/brand.service';
import { SignupCustomerDto } from 'src/user/dto/signup-customer.dto';
import { UserService } from 'src/user/user.service';

@Injectable()
export class AuthService {
  constructor(
 private userService: UserService, 
    private jwtService: JwtService,
     private brandService: BrandService,
    private redisService: RedisService,
    private mailerService: MailerService,
    private configService: ConfigService,
  ) {}

  // LOGIN
async login(email: string, password: string) {
  try {
   const user = await this.userService.findByEmail(email);

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
private async handleCustomerCreation(record: any) {
  const hashedPassword = await hashPassword(record.dto.password);

  await this.userService.createCustomerUser(
    record.dto,
    hashedPassword
  );

  await this.redisService.del(record.dto.email);

  return {
    message: 'Customer created successfully',
  };
}


async signupCustomer(dto: SignupCustomerDto) {
 const existingUser = await this.userService.findByEmail(dto.email);

  if (existingUser) {
    throw new ConflictException('User already exists with this email');
  }

  const otp = generateOtp();

const payload = {
  type: 'CUSTOMER',
  otp,
  dto,
};

await this.redisService.set(dto.email, payload, 43200);


  await this.mailerService.sendOtp(dto.email, otp);

  return {
    message: 'OTP sent to email',
  };
}
private async handleBrandCreation(record: any) {
  return this.brandService.createBrandAfterOtp(record);
}
async verifyOtp(email: string, otp: string) {
  try {
    const recordRaw = await this.redisService.get(email);
const record = typeof recordRaw === 'string'
  ? JSON.parse(recordRaw)
  : recordRaw;

    if (!record) {
      throw new BadRequestException('Invalid or expired OTP');
    }

    if (record.otp !== otp) {
      throw new BadRequestException('Invalid OTP');
    }

    if (record.type === 'BRAND') {
      return await this.handleBrandCreation(record);
    }

    if (record.type === 'CUSTOMER') {
      return await this.handleCustomerCreation(record);
    }

    throw new BadRequestException('Invalid verification type');
  } catch (error) {
    if (error instanceof BadRequestException) throw error;
console.log(error,"error")
    throw new InternalServerErrorException('OTP verification failed');
  }
}





}

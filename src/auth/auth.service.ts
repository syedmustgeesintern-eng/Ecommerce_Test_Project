import {
  BadRequestException,
  ConflictException,
  Injectable,
  InternalServerErrorException,
  UnauthorizedException,
} from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import { comparePassword, hashPassword } from '../utils/bcrypt.util';
import { ConfigService } from '@nestjs/config';
import { generateOtp } from 'src/utils/generate.utils';
import { RedisService } from '../libs/redis/redis.service';
import { MailerService } from '../libs/mail/mailer.service';
import { BrandService } from '../brand/brand.service';
import { SignupCustomerDto } from 'src/user/dto/signup-customer.dto';
import { UserService } from 'src/user/user.service';
import { ChangePasswordDto } from './dto/change-password.dto';
import { JwtUser } from 'src/utils/types/jwt-user.type';
import { v4 as uuid } from 'uuid';

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

  private otpHandlers = {
    CUSTOMER: this.handleCustomerCreation.bind(this),
    BRAND: this.handleBrandCreation.bind(this),
    FORGOT_PASSWORD: this.handleForgotPassword.bind(this),
  };
  // LOGIN
  async login(email: string, password: string) {
    try {
      const user = await this.userService.findByEmail(email);

      if (!user) throw new UnauthorizedException('Invalid credentials');

      const isMatch = await comparePassword(password, user.password);

      if (!isMatch) throw new UnauthorizedException('Invalid credentials');

      const payload = {
        sub: user.id,
        role: user.role,
        brandId: user.brandId,
      };

      const accessToken = this.jwtService.sign(payload, {
        secret: this.configService.getOrThrow('JWT_SECRET'),
        expiresIn: this.configService.getOrThrow(
          'JWT_ACCESS_EXPIRES_IN',
        ) as any,
      });

      const refreshToken = this.jwtService.sign(payload, {
        secret: this.configService.getOrThrow('JWT_SECRET'),
        expiresIn: this.configService.getOrThrow(
          'JWT_REFRESH_EXPIRES_IN',
        ) as any,
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
          expiresIn: this.configService.getOrThrow<string>(
            'JWT_ACCESS_EXPIRES_IN',
          ) as any,
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

    await this.userService.createCustomerUser(record.dto, hashedPassword);

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

    await this.redisService.set(
      `otp:${dto.email}`,
      {
        type: 'CUSTOMER',
        otp,
        dto,
      },
      43200,
    );

    await this.mailerService.sendOtp(dto.email, otp);

    return {
      message: 'OTP sent to email',
    };
  }

  private async handleBrandCreation(record: any) {
    return this.brandService.createBrandAfterOtp(record);
  }
  async verifyOtp(email: string, otp: string) {
    const recordRaw = await this.redisService.get(`otp:${email}`);

    const record =
      typeof recordRaw === 'string' ? JSON.parse(recordRaw) : recordRaw;

    if (!record || record.otp !== otp) {
      throw new BadRequestException('Invalid or expired OTP');
    }

    const handler = this.otpHandlers[record.type];

    if (!handler) {
      throw new BadRequestException('Invalid verification type');
    }

    let result;

    // FORGOT PASSWORD needs email only
    if (record.type === 'FORGOT_PASSWORD') {
      result = await handler(email);
    } else {
      result = await handler(record);
    }

    await this.redisService.del(`otp:${email}`);

    return result;
  }

  //change password
  async changePassword(user: JwtUser, dto: ChangePasswordDto) {
    try {
      const existingUser = await this.userService.findById(user.userId);

      if (!existingUser) {
        throw new UnauthorizedException('User not found');
      }

      const isMatch = await comparePassword(
        dto.oldPassword,
        existingUser.password,
      );

      if (!isMatch) {
        throw new BadRequestException('Old password is incorrect');
      }
      if (dto.oldPassword === dto.newPassword) {
        throw new BadRequestException('New password must be different');
      }
      const hashedPassword = await hashPassword(dto.newPassword);

      await this.userService.updatePassword(existingUser.id, hashedPassword);

      return {
        message: 'Password updated successfully',
      };
    } catch (error) {
      if (
        error instanceof BadRequestException ||
        error instanceof UnauthorizedException
      ) {
        throw error;
      }

      throw new InternalServerErrorException('Failed to update password');
    }
  }
  //handler function
  private async handleForgotPassword(email: string) {
    const user = await this.userService.findByEmail(email);
    if (!user) {
      throw new BadRequestException('User not found');
    }

    const token = uuid();

    await this.userService.updateResetToken(
      user.id,
      token,
      new Date(Date.now() + 15 * 60 * 1000),
    );

    const resetLink = `${this.configService.get(
      'FRONTEND_URL',
    )}/reset-password?token=${token}`;

    await this.mailerService.sendResetPasswordLink(email, resetLink);

    return {
      message: 'Reset password link sent to email',
    };
  }
  async forgotPassword(email: string) {
    const user = await this.userService.findByEmail(email);
    if (!user) {
      throw new BadRequestException('User not found');
    }
    const otp = generateOtp();

    await this.redisService.set(
      `otp:${email}`,
      {
        type: 'FORGOT_PASSWORD',
        otp,
      },
      300,
    );

    await this.mailerService.sendOtp(email, otp);

    return { message: 'OTP sent to email' };
  }

  async resetPassword(token: string, newPassword: string) {
    const user = await this.userService.findByResetToken(token);

    const hashed = await hashPassword(newPassword);

    await this.userService.updatePassword(user.id, hashed);

    // (single-use)
    await this.userService.clearResetToken(user.id);

    return { message: 'Password reset successful' };
  }
}

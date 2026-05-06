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
import { createHash } from 'crypto';

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

  private parseExpiryToSeconds(expiry: string): number {
    const match = String(expiry).trim().match(/^(\d+)([smhd])$/i);
    if (!match) {
      throw new InternalServerErrorException(
        'Invalid JWT_REFRESH_EXPIRES_IN format',
      );
    }

    const value = Number(match[1]);
    const unit = match[2].toLowerCase();
    const unitSeconds = { s: 1, m: 60, h: 3600, d: 86400 }[unit];
    if (!unitSeconds) {
      throw new InternalServerErrorException(
        'Invalid JWT_REFRESH_EXPIRES_IN unit',
      );
    }
    return value * unitSeconds;
  }

  private hashToken(token: string): string {
    return createHash('sha256').update(token).digest('hex');
  }

  private getRefreshRedisKey(userId: string): string {
    return `auth:refresh:${userId}`;
  }

  private async issueTokenPair(user: {
    id: string;
    role: string;
    brandId: string | null;
  }) {
    const accessPayload = {
      sub: user.id,
      role: user.role,
      brandId: user.brandId,
      tokenType: 'access',
    };
    const refreshJti = uuid();
    const refreshPayload = {
      sub: user.id,
      role: user.role,
      brandId: user.brandId,
      tokenType: 'refresh',
      jti: refreshJti,
    };

    const accessToken = this.jwtService.sign(accessPayload, {
      secret: this.configService.getOrThrow('JWT_SECRET'),
      expiresIn: this.configService.getOrThrow('JWT_ACCESS_EXPIRES_IN') as any,
    });

    const refreshToken = this.jwtService.sign(refreshPayload, {
      secret: this.configService.getOrThrow('JWT_SECRET'),
      expiresIn: this.configService.getOrThrow('JWT_REFRESH_EXPIRES_IN') as any,
    });

    const refreshTtlSeconds = this.parseExpiryToSeconds(
      this.configService.getOrThrow<string>('JWT_REFRESH_EXPIRES_IN'),
    );

    await this.redisService.set(
      this.getRefreshRedisKey(user.id),
      {
        hashedToken: this.hashToken(refreshToken),
        jti: refreshJti,
      },
      refreshTtlSeconds,
    );

    return { accessToken, refreshToken };
  }

  private async rotateRefreshToken(payload: {
    sub: string;
    role: string;
    brandId?: string | null;
    jti: string;
  }, token: string) {
    const key = this.getRefreshRedisKey(payload.sub);
    const stored = await this.redisService.get(key);
    const hashedIncoming = this.hashToken(token);

    if (
      !stored ||
      stored.jti !== payload.jti ||
      stored.hashedToken !== hashedIncoming
    ) {
      throw new UnauthorizedException('Refresh token expired or rotated');
    }

    return this.issueTokenPair({
      id: payload.sub,
      role: payload.role,
      brandId: payload.brandId ?? null,
    });
  }
  // LOGIN
  async login(email: string, password: string) {
    try {
      const user = await this.userService.findByEmail(email);

      if (!user) throw new UnauthorizedException('Invalid credentials');

      const isMatch = await comparePassword(password, user.password);

      if (!isMatch) throw new UnauthorizedException('Invalid credentials');

      return this.issueTokenPair({
        id: user.id,
        role: user.role,
        brandId: user.brandId,
      });
    } catch (error) {
      if (error instanceof UnauthorizedException) throw error;

      throw new InternalServerErrorException('Login failed');
    }
  }

  // REFRESH TOKEN
  async refreshToken(token: string) {
    try {
      const payload = this.jwtService.verify(token, {
        secret: this.configService.getOrThrow('JWT_SECRET'),
      });

      if (payload.tokenType !== 'refresh' || !payload.sub || !payload.jti) {
        throw new UnauthorizedException('Invalid refresh token');
      }

      return this.rotateRefreshToken(
        {
          sub: payload.sub,
          role: payload.role,
          brandId: payload.brandId ?? null,
          jti: payload.jti,
        },
        token,
      );
    } catch (err) {
      if (err instanceof UnauthorizedException) {
        throw err;
      }
      throw new UnauthorizedException('Invalid refresh token');
    }
  }

  async refreshTokenWithPayload(user: {
    sub: string;
    role: string;
    brandId?: string | null;
    jti: string;
    refreshToken: string;
  }) {
    return this.rotateRefreshToken(
      {
        sub: user.sub,
        role: user.role,
        brandId: user.brandId ?? null,
        jti: user.jti,
      },
      user.refreshToken,
    );
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

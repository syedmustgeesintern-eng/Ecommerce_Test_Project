import { Module } from '@nestjs/common';
import { AppController } from './app.controller';
import { AppService } from './app.service';
import { BrandModule } from './brand/brand.module';
import { ConfigModule, ConfigService } from '@nestjs/config';
import { TypeOrmModule } from '@nestjs/typeorm';
import { databaseConfig } from './database/database.config';
import { AuthModule } from './auth/auth.module';
import { MailerModule } from './libs/mail/mailer.module';
import { RedisModule } from './libs/redis/redis.module';
import { S3Module } from './libs/s3/s3.module';
import { UserModule } from './user/user.module';
import { JwtStrategy } from './utils/strategies/jwt.strategy';
import { ProductModule } from './product/product.module';
import { CategoryModule } from './category/category.module';

@Module({
  imports: [
    ConfigModule.forRoot({ isGlobal: true }),
    TypeOrmModule.forRootAsync({
      imports: [ConfigModule],
      inject: [ConfigService],
      useFactory: databaseConfig,
    }),
    BrandModule,
    UserModule,
    AuthModule,
    MailerModule,
    RedisModule,
    S3Module,
    ProductModule,
    CategoryModule
  ],
  controllers: [AppController],
  providers: [AppService, JwtStrategy],
})
export class AppModule {}

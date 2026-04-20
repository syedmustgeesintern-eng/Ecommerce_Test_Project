import { Module } from '@nestjs/common';
import { AppController } from './app.controller';
import { AppService } from './app.service';
import { BrandModule } from './modules/brand/brand.module';
import { UserModule } from './modules/user/user.module';
import { ConfigModule, ConfigService } from '@nestjs/config';
import { TypeOrmModule } from '@nestjs/typeorm';
import { databaseConfig } from './database/database.config';
import { AuthModule } from './modules/auth/auth.module';
import { MailerModule } from './modules/mail/mailer.module';
import { RedisModule } from './modules/redis/redis.module';
import { S3Service } from './modules/s3/s3.service';
import { S3Module } from './modules/s3/s3.module';

@Module({
  imports: [
    ConfigModule.forRoot({ isGlobal: true }),

    TypeOrmModule.forRootAsync({
  imports: [ConfigModule],
  inject: [ConfigService],
  useFactory: (configService: ConfigService) => ({
    type: 'postgres',
    host: configService.getOrThrow('DB_HOST'),
    port: Number(configService.getOrThrow('DB_PORT')),
    username: configService.getOrThrow('DB_USER'),
    password: configService.getOrThrow('DB_PASS'),
    database: configService.getOrThrow('DB_NAME'),

    autoLoadEntities: true,
    synchronize: false,
  }),
}),


    BrandModule,
    UserModule,
    AuthModule,
    MailerModule,
    RedisModule,
    S3Module,
  ],
  controllers: [AppController],
  providers: [AppService, S3Service],
})
export class AppModule {}

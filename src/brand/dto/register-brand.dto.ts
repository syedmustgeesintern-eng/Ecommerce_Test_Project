import { IsEmail, IsNotEmpty, IsOptional, IsString } from 'class-validator';

export class RegisterBrandDto {
  @IsString()
  @IsNotEmpty()
  brandName: string;

  @IsNotEmpty()
  @IsEmail()
  email: string;

  @IsOptional()
  @IsString()
  phone?: string;

  @IsOptional()
  @IsEmail()
  supportEmail?: string;

  @IsOptional()
  @IsString()
  logoUrl?: string;
}

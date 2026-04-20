import { IsEmail, IsNotEmpty, IsString } from 'class-validator';

export class RegisterBrandDto {
  @IsString()
  @IsNotEmpty()
  brandName: string;

  @IsEmail()
  email: string;

  @IsString()
  phone: string;

  @IsEmail()
  supportEmail: string;

  @IsString()
  logoUrl: string;
}

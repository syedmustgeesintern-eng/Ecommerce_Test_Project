// update-brand.dto.ts

import { IsOptional, IsString, IsEmail } from 'class-validator';

export class UpdateBrandDto {
  
  @IsOptional()
  @IsString()
  name?: string;

  @IsOptional()
  @IsString()
  phone?: string;

  @IsOptional()
  @IsEmail()
  support_email?: string;
}

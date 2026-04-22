import { IsEmail, IsOptional, IsString, MinLength } from 'class-validator';

export class SignupCustomerDto {
  @IsString()
  name: string;

  @IsEmail()
  email: string;

  @MinLength(6)
  password: string;

  @IsOptional()
  @IsString()
  phoneNumber?: string;

}

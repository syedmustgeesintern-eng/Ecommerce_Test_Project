import {
  IsBoolean,
  IsOptional,
  IsString,
  Matches,
  MaxLength,
  MinLength,
} from 'class-validator';

export class CreateAddressDto {
  @IsString()
  @MinLength(1)
  @MaxLength(200)
  fullName: string;

  @IsString()
  @Matches(/^\+?[0-9\s\-]{5,32}$/, {
    message: 'phoneNumber must be a valid phone number',
  })
  phoneNumber: string;

  @IsString()
  @MinLength(1)
  @MaxLength(100)
  country: string;

  @IsString()
  @MinLength(1)
  @MaxLength(120)
  city: string;

  @IsOptional()
  @IsString()
  @MaxLength(120)
  state?: string | null;

  @IsString()
  @MinLength(2)
  @MaxLength(32)
  postalCode: string;

  @IsString()
  @MinLength(1)
  @MaxLength(255)
  streetAddress: string;

  /** Home, Office, Other — free-form label */
  @IsOptional()
  @IsString()
  @MaxLength(50)
  addressLabel?: string | null;

  /** Explicitly request this address become the default */
  @IsOptional()
  @IsBoolean()
  isDefault?: boolean;
}

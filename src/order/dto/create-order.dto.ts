import { Type } from 'class-transformer';
import {
  ArrayMaxSize,
  ArrayMinSize,
  IsArray,
  IsBoolean,
  IsOptional,
  IsString,
  IsUUID,
  Matches,
  MaxLength,
  MinLength,
  ValidateNested,
} from 'class-validator';
import { CreateOrderItemDto } from './create-order-item.dto';

/**
 * Inline address used at checkout when the customer does not want to save
 * the address to their profile, or edits a saved address temporarily.
 */
export class ShippingAddressOverrideDto {
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
}

const MAX_ORDER_LINE_ITEMS = 100;

export class CreateOrderDto {
  @IsArray()
  @ArrayMinSize(1)
  @ArrayMaxSize(MAX_ORDER_LINE_ITEMS)
  @ValidateNested({ each: true })
  @Type(() => CreateOrderItemDto)
  items: CreateOrderItemDto[];

  @IsOptional()
  @IsUUID()
  addressId?: string;

  @IsOptional()
  @ValidateNested()
  @Type(() => ShippingAddressOverrideDto)
  shippingAddressOverride?: ShippingAddressOverrideDto;

  @IsOptional()
  @IsBoolean()
  saveAddress?: boolean;
}

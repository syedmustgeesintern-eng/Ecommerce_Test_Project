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

/** Inline shipping address fields the frontend sends at checkout. */
export class ShippingAddressDto {
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

  @IsOptional()
  @IsString()
  @MaxLength(50)
  addressLabel?: string | null;
}

const MAX_ORDER_LINE_ITEMS = 100;

export class CreateOrderDto {
  @IsArray()
  @ArrayMinSize(1)
  @ArrayMaxSize(MAX_ORDER_LINE_ITEMS)
  @ValidateNested({ each: true })
  @Type(() => CreateOrderItemDto)
  items: CreateOrderItemDto[];

  /** ID of a saved address from the user's profile. Mutually exclusive with shippingAddress. */
  @IsOptional()
  @IsUUID()
  addressId?: string;

  /** Inline address fields. Use when not selecting a saved address. Mutually exclusive with addressId. */
  @IsOptional()
  @ValidateNested()
  @Type(() => ShippingAddressDto)
  shippingAddress?: ShippingAddressDto;

  /** @deprecated Inline addresses are always persisted; this field is ignored. */
  @IsOptional()
  @IsBoolean()
  saveAddress?: boolean;

  /** When true, the inline or resolved address is marked as the user's default. */
  @IsOptional()
  @IsBoolean()
  setAsDefault?: boolean;
}

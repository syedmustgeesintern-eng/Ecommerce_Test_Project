import { IsInt, IsOptional, IsUUID, Max, Min } from 'class-validator';

export class AddCartItemDto {
  @IsOptional()
  @IsUUID('4')
  variantId?: string;

  @IsOptional()
  sku?: string;

  @IsInt()
  @Min(1)
  @Max(99999)
  quantity = 1;
}

import { Type } from 'class-transformer';
import { IsInt, IsUUID, Max, Min } from 'class-validator';

export class CreateOrderItemDto {
  @IsUUID('4')
  variantId: string;

  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(99999)
  quantity: number;
}

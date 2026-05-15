import { IsInt, Max, Min } from 'class-validator';

export class UpdateCartItemDto {
  @IsInt()
  @Min(1)
  @Max(99999)
  quantity: number;
}

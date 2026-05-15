import { IsInt, Min, Max, IsOptional, IsString } from 'class-validator';
import { Type } from 'class-transformer';

export class AddReviewDto {
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(5)
  rating: number;

  @IsOptional()
  @IsString()
  review?: string;
}

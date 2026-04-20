import { PartialType } from '@nestjs/mapped-types';
import { RegisterBrandDto } from './register-brand.dto';

export class UpdateBrandDto extends PartialType(RegisterBrandDto) {}

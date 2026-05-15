import {
  Body,
  Controller,
  Get,
  Param,
  Post,
  ValidationPipe,
} from '@nestjs/common';
import { CategoryService } from './category.service';
import { CreateCategoryDto } from './dto/create-category.dto';

@Controller('categories')
export class CategoryController {
  constructor(private categoryService: CategoryService) {}

  @Post()
  create(
    @Body(
      new ValidationPipe({
        transform: true,
        whitelist: true,
        forbidNonWhitelisted: true,
      }),
    )
    dto: CreateCategoryDto,
  ) {
    return this.categoryService.create(dto);
  }

  @Get()
  getRootCategories() {
    return this.categoryService.getRootCategories();
  }

  @Get('tree')
  getFullTree() {
    return this.categoryService.getFullTree();
  }

  @Get(':id/children')
  getChildren(@Param('id') id: string) {
    return this.categoryService.getChildren(id);
  }
}

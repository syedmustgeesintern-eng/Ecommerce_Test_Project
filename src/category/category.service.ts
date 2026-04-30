import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { CreateCategoryDto } from './dto/create-category.dto';
import { Category } from './entities/category.entity';

@Injectable()
export class CategoryService {
  constructor(
    @InjectRepository(Category)
    private categoryRepo: Repository<Category>,
  ) {}

  async create(dto: CreateCategoryDto) {
    const category = this.categoryRepo.create({
      name: dto.name,
    });

    await this.categoryRepo.save(category);

    return {
      message: 'Category created',
      data: category,
    };
  }

  async findAll() {
    const categories = await this.categoryRepo.find({
      order: { createdAt: 'DESC' },
    });

    return categories;
  }
}
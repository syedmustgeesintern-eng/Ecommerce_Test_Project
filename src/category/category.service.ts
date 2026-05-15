import {
  BadRequestException,
  ConflictException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { IsNull, Repository } from 'typeorm';
import { CreateCategoryDto } from './dto/create-category.dto';
import { Category } from './entities/category.entity';

export type CategoryTreeNode = {
  id: string;
  name: string;
  slug: string;
  parentId: string | null;
  level: number;
  isActive: boolean;
  hasChildren: boolean;
  children: CategoryTreeNode[];
  createdAt: Date;
  updatedAt: Date;
};

@Injectable()
export class CategoryService {
  constructor(
    @InjectRepository(Category)
    private categoryRepo: Repository<Category>,
  ) {}

  private normalizeSlug(value: string) {
    const slug = value
      .trim()
      .toLowerCase()
      .replace(/['"]/g, '')
      .replace(/[^a-z0-9]+/g, '-')
      .replace(/^-+|-+$/g, '');

    if (!slug) {
      throw new BadRequestException(
        'Category slug must contain letters or numbers',
      );
    }

    return slug;
  }

  private serializeCategory(category: Category, hasChildren = false) {
    return {
      id: category.id,
      name: category.name,
      slug: category.slug,
      parentId: category.parentId ?? null,
      level: category.level,
      isActive: category.isActive,
      hasChildren,
      createdAt: category.createdAt,
      updatedAt: category.updatedAt,
    };
  }

  private async getChildrenCounts(parentIds: string[]) {
    if (!parentIds.length) {
      return new Map<string, number>();
    }

    const rows = await this.categoryRepo
      .createQueryBuilder('category')
      .select('category.parentId', 'parentId')
      .addSelect('COUNT(category.id)', 'count')
      .where('category.parentId IN (:...parentIds)', { parentIds })
      .andWhere('category.isActive = :isActive', { isActive: true })
      .andWhere('category.deletedAt IS NULL')
      .groupBy('category.parentId')
      .getRawMany<{ parentId: string; count: string }>();

    return new Map(rows.map((row) => [row.parentId, Number(row.count)]));
  }

  async create(dto: CreateCategoryDto) {
    const slug = this.normalizeSlug(dto.slug ?? dto.name);

    const existing = await this.categoryRepo.findOne({
      where: { slug },
      withDeleted: true,
    });

    if (existing) {
      throw new ConflictException('Category slug already exists');
    }

    let parent: Category | null = null;
    if (dto.parentId) {
      parent = await this.categoryRepo.findOne({
        where: { id: dto.parentId, isActive: true },
      });

      if (!parent) {
        throw new NotFoundException('Parent category not found');
      }
    }

    const category = this.categoryRepo.create({
      name: dto.name,
      slug,
      parent,
      parentId: parent?.id ?? null,
      level: parent ? parent.level + 1 : 0,
      isActive: dto.isActive ?? true,
    });

    const saved = await this.categoryRepo.save(category);

    return {
      message: 'Category created',
      data: this.serializeCategory(saved, false),
    };
  }

  async getRootCategories() {
    const categories = await this.categoryRepo.find({
      where: {
        parentId: IsNull(),
        isActive: true,
      },
      order: { name: 'ASC' },
    });

    const childrenCounts = await this.getChildrenCounts(
      categories.map((category) => category.id),
    );

    return categories.map((category) =>
      this.serializeCategory(
        category,
        (childrenCounts.get(category.id) ?? 0) > 0,
      ),
    );
  }

  async getChildren(categoryId: string) {
    const parentExists = await this.categoryRepo.exists({
      where: { id: categoryId, isActive: true },
    });

    if (!parentExists) {
      throw new NotFoundException('Category not found');
    }

    const categories = await this.categoryRepo.find({
      where: {
        parentId: categoryId,
        isActive: true,
      },
      order: { name: 'ASC' },
    });

    const childrenCounts = await this.getChildrenCounts(
      categories.map((category) => category.id),
    );

    return categories.map((category) =>
      this.serializeCategory(
        category,
        (childrenCounts.get(category.id) ?? 0) > 0,
      ),
    );
  }

  async getFullTree() {
    const categories = await this.categoryRepo.find({
      where: { isActive: true },
      order: {
        level: 'ASC',
        name: 'ASC',
      },
    });

    const nodeById = new Map<string, CategoryTreeNode>();
    const roots: CategoryTreeNode[] = [];

    for (const category of categories) {
      nodeById.set(category.id, {
        ...this.serializeCategory(category, false),
        children: [],
      });
    }

    for (const category of categories) {
      const node = nodeById.get(category.id);
      if (!node) continue;

      if (category.parentId && nodeById.has(category.parentId)) {
        nodeById.get(category.parentId)!.children.push(node);
      } else {
        roots.push(node);
      }
    }

    for (const node of nodeById.values()) {
      node.hasChildren = node.children.length > 0;
    }

    return roots;
  }
}

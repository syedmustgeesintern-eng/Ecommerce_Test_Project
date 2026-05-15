import { Product } from '../../product/entities/product.entity';
import {
  Column,
  CreateDateColumn,
  DeleteDateColumn,
  Entity,
  Index,
  JoinColumn,
  ManyToMany,
  ManyToOne,
  OneToMany,
  PrimaryGeneratedColumn,
  UpdateDateColumn,
} from 'typeorm';

@Entity('categories')
@Index(['slug'], { unique: true })
@Index(['parentId'])
@Index(['isActive'])
export class Category {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column()
  name: string;

  @Column({ type: 'varchar' })
  slug: string;

  @ManyToOne(() => Category, (category) => category.children, {
    nullable: true,
    onDelete: 'SET NULL',
  })
  @JoinColumn({ name: 'parentId' })
  parent: Category | null;

  @Column({ type: 'uuid', nullable: true })
  parentId: string | null;

  @OneToMany(() => Category, (category) => category.parent)
  children: Category[];

  @ManyToMany(() => Product, (product) => product.categories)
  products: Product[];

  @Column({ type: 'int', default: 0 })
  level: number;

  @Column({ type: 'boolean', default: true })
  isActive: boolean;

  @CreateDateColumn()
  createdAt: Date;

  @UpdateDateColumn()
  updatedAt: Date;

  @DeleteDateColumn()
  deletedAt: Date | null;
}

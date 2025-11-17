import {
  Column,
  CreateDateColumn,
  Entity,
  JoinTable,
  ManyToMany,
  ManyToOne,
  PrimaryGeneratedColumn,
  UpdateDateColumn,
} from 'typeorm';
import { Category } from './category.entity';
import { Tag } from './tag.entity';
import { User } from '@/modules/users/entities/user.entity';

export enum PostStatus {
  DRAFT = 'draft',
  PUBLISHED = 'published',
}

@Entity()
export class PostEntity {
  @PrimaryGeneratedColumn('uuid')
  id!: string;

  @Column({ unique: true })
  slug!: string;

  @Column()
  title!: string;

  @Column({ type: 'text' })
  content!: string;

  @Column({ type: 'text', default: '' })
  excerpt!: string;

  @Column({ default: '' })
  coverImageUrl!: string;

  @Column({ type: 'int', default: 1 })
  readingTimeMinutes!: number;

  @Column({ type: 'enum', enum: PostStatus, default: PostStatus.DRAFT })
  status!: PostStatus;

  @ManyToOne(() => User, { eager: true, nullable: false })
  author!: User;

  @ManyToOne(() => Category, (c) => c.posts, { eager: true, nullable: true })
  category?: Category | null;

  @ManyToMany(() => Tag, { eager: true })
  @JoinTable()
  tags?: Tag[];

  @CreateDateColumn()
  createdAt!: Date;

  @UpdateDateColumn()
  updatedAt!: Date;
}

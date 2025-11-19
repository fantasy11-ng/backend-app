import {
  BadRequestException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { ILike, In, Repository } from 'typeorm';
import { PostEntity, PostStatus } from './entities/post.entity';
import { Category } from './entities/category.entity';
import { Tag } from './entities/tag.entity';
import { CreatePostDto, QueryPostsDto, UpdatePostDto } from './dto/post.dto';
import { CreateCategoryDto, UpdateCategoryDto } from './dto/category.dto';
import { CreateTagDto, UpdateTagDto } from './dto/tag.dto';
import { User } from '@/modules/users/entities/user.entity';

@Injectable()
export class BlogService {
  constructor(
    @InjectRepository(PostEntity) private posts: Repository<PostEntity>,
    @InjectRepository(Category) private categories: Repository<Category>,
    @InjectRepository(Tag) private tags: Repository<Tag>,
  ) {}

  // Public
  async listPosts(query: QueryPostsDto) {
    const where: any = {};
    if (query.status) where.status = query.status;
    else where.status = PostStatus.PUBLISHED;
    if (query.category) where.category = { id: query.category };
    if (query.q) where.title = ILike(`%${query.q}%`);

    const take = query.limit || 20;
    const skip = ((query.page || 1) - 1) * take;
    const [items, total] = await this.posts.findAndCount({
      where,
      take,
      skip,
      order: { createdAt: 'DESC' },
    });
    return { items, total, page: query.page || 1, limit: take };
  }

  async getPostBySlug(slug: string) {
    const post = await this.posts.findOne({
      where: { slug, status: PostStatus.PUBLISHED },
    });
    if (!post) throw new NotFoundException('Post not found');
    const related = await this.getRelatedPosts(
      post.id,
      post.category?.id,
      (post.tags || []).map((t) => t.id),
    );
    return { post, related };
  }

  async listCategories() {
    return this.categories.find({ order: { name: 'ASC' } });
  }

  async listTags() {
    return this.tags.find({ order: { name: 'ASC' } });
  }

  // Admin
  async createPost(author: User, dto: CreatePostDto) {
    await this.ensureUniqueSlug(dto.slug);
    const post = new PostEntity();
    post.title = dto.title;
    post.slug = dto.slug;
    post.content = dto.content;
    post.readingTimeMinutes = this.computeReadingTime(dto.content);
    post.excerpt = dto.excerpt || '';
    post.coverImageUrl = dto.coverImageUrl || '';
    post.status = dto.status || PostStatus.DRAFT;
    post.author = author;

    if (dto.categoryId) {
      const cat = await this.categories.findOne({
        where: { id: dto.categoryId },
      });
      post.category = cat || null;
    }
    if (dto.tagIds?.length) {
      post.tags = await this.tags.find({ where: { id: In(dto.tagIds) } });
    }
    return this.posts.save(post);
  }

  async updatePost(id: string, dto: UpdatePostDto) {
    const post = await this.posts.findOne({ where: { id } });
    if (!post) throw new NotFoundException('Post not found');
    if (dto.slug && dto.slug !== post.slug)
      await this.ensureUniqueSlug(dto.slug);

    Object.assign(post, {
      title: dto.title ?? post.title,
      slug: dto.slug ?? post.slug,
      content: dto.content ?? post.content,
      readingTimeMinutes: dto.content
        ? this.computeReadingTime(dto.content)
        : post.readingTimeMinutes,
      excerpt: dto.excerpt ?? post.excerpt,
      coverImageUrl: dto.coverImageUrl ?? post.coverImageUrl,
      status: dto.status ?? post.status,
    });

    if (dto.categoryId !== undefined) {
      if (dto.categoryId === null) post.category = null;
      else {
        const cat = await this.categories.findOne({
          where: { id: dto.categoryId },
        });
        post.category = cat || null;
      }
    }
    if (dto.tagIds) {
      post.tags = await this.tags.find({ where: { id: In(dto.tagIds) } });
    }
    return this.posts.save(post);
  }

  async deletePost(id: string) {
    await this.posts.delete({ id });
    return { message: 'Deleted' };
  }

  async ensureUniqueSlug(slug: string) {
    const existing = await this.posts.findOne({ where: { slug } });
    if (existing) throw new BadRequestException('Slug already in use');
  }

  async createCategory(dto: CreateCategoryDto) {
    if (await this.categories.findOne({ where: { slug: dto.slug } }))
      throw new BadRequestException('Category slug already exists');
    return this.categories.save({ name: dto.name, slug: dto.slug });
  }

  async updateCategory(id: string, dto: UpdateCategoryDto) {
    const cat = await this.categories.findOne({ where: { id } });
    if (!cat) throw new NotFoundException('Category not found');
    if (dto.slug && dto.slug !== cat.slug) {
      if (await this.categories.findOne({ where: { slug: dto.slug } }))
        throw new BadRequestException('Category slug already exists');
    }
    Object.assign(cat, dto);
    return this.categories.save(cat);
  }

  async deleteCategory(id: string) {
    await this.categories.delete({ id });
    return { message: 'Deleted' };
  }

  async createTag(dto: CreateTagDto) {
    if (await this.tags.findOne({ where: { slug: dto.slug } }))
      throw new BadRequestException('Tag slug already exists');
    return this.tags.save({ name: dto.name, slug: dto.slug });
  }

  async updateTag(id: string, dto: UpdateTagDto) {
    const tag = await this.tags.findOne({ where: { id } });
    if (!tag) throw new NotFoundException('Tag not found');
    if (dto.slug && dto.slug !== tag.slug) {
      if (await this.tags.findOne({ where: { slug: dto.slug } }))
        throw new BadRequestException('Tag slug already exists');
    }
    Object.assign(tag, dto);
    return this.tags.save(tag);
  }

  async deleteTag(id: string) {
    await this.tags.delete({ id });
    return { message: 'Deleted' };
  }

  private async getRelatedPosts(
    excludePostId: string,
    categoryId?: string,
    tagIds?: string[],
  ) {
    const qb = this.posts
      .createQueryBuilder('p')
      .leftJoin('p.tags', 't')
      .where('p.status = :status', { status: PostStatus.PUBLISHED })
      .andWhere('p.id <> :excludeId', { excludeId: excludePostId });

    if (categoryId) {
      qb.andWhere('p.categoryId = :categoryId', { categoryId });
    }
    if (tagIds && tagIds.length) {
      qb.orWhere('t.id IN (:...tagIds)', { tagIds });
    }

    return qb.orderBy('p.createdAt', 'DESC').limit(5).getMany();
  }

  private computeReadingTime(content: string) {
    const words = (content || '')
      .replace(/\s+/g, ' ')
      .trim()
      .split(' ')
      .filter(Boolean).length;
    const minutes = Math.ceil(words / 200);
    return Math.max(1, minutes);
  }
}

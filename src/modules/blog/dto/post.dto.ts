import { z } from 'zod';
import { PostStatus } from '../entities/post.entity';

export const createPostDtoSchema = z.object({
  title: z.string().min(3),
  slug: z.string().min(3),
  content: z.string().min(1),
  excerpt: z.string().optional(),
  coverImageUrl: z.string().url().optional(),
  categoryId: z.string().uuid().nullable().optional(),
  tagIds: z.array(z.string().uuid()).optional(),
  status: z.nativeEnum(PostStatus).optional(),
});

export class CreatePostDto {
  title!: string;
  slug!: string;
  content!: string;
  excerpt?: string;
  coverImageUrl?: string;
  categoryId?: string | null;
  tagIds?: string[];
  status?: PostStatus;
}

export const updatePostDtoSchema = createPostDtoSchema.partial();
export class UpdatePostDto extends CreatePostDto {}

export const queryPostsDtoSchema = z.object({
  q: z.string().optional(),
  status: z.nativeEnum(PostStatus).optional(),
  category: z.string().uuid().optional(),
  tag: z.string().uuid().optional(),
  page: z.coerce.number().min(1).default(1),
  limit: z.coerce.number().min(1).max(100).default(20),
});

export class QueryPostsDto {
  q?: string;
  status?: PostStatus;
  category?: string;
  tag?: string;
  page?: number;
  limit?: number;
}

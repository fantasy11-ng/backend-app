import { z } from 'zod';

export const createTagDtoSchema = z.object({
  name: z.string().min(2),
  slug: z.string().min(2),
});

export class CreateTagDto {
  name!: string;
  slug!: string;
}

export const updateTagDtoSchema = createTagDtoSchema.partial();
export class UpdateTagDto extends CreateTagDto {}

import { z } from 'zod';

export const createCategoryDtoSchema = z.object({
  name: z.string().min(2),
  slug: z.string().min(2),
});

export class CreateCategoryDto {
  name!: string;
  slug!: string;
}

export const updateCategoryDtoSchema = createCategoryDtoSchema.partial();
export class UpdateCategoryDto extends CreateCategoryDto {}

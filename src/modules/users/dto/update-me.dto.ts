import { z } from 'zod';

export const updateMeDtoSchema = z.object({
  fullName: z.string().min(1).optional(),
  phone: z.string().optional(),
  profileImageUrl: z.string().optional(),
});

export class UpdateMeDto {
  fullName?: string;
  phone?: string;
  profileImageUrl?: string;
}

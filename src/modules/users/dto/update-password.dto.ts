import { z } from 'zod';

export const updatePasswordDtoSchema = z.object({
  currentPassword: z.string().min(6),
  newPassword: z.string().min(6),
});

export class UpdatePasswordDto {
  currentPassword: string;
  newPassword: string;
}



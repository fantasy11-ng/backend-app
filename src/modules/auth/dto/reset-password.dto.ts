import { z } from 'zod';

export const resetPasswordDtoSchema = z.object({
  email: z.string().email(),
  password: z.string().min(6),
  token: z.string(),
});

export class ResetPasswordDto {
  email: string;
  password: string;
  token: string;
}

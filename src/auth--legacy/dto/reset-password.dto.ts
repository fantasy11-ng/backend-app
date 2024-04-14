import { z } from 'zod';

export const resetPasswordDtoSchema = z.object({
  email: z.string().email(),
  password: z.string().min(6),
  token: z.string(),
});

export type ResetPasswordDto = z.infer<typeof resetPasswordDtoSchema>;

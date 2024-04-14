import { z } from 'zod';

export const signInDtoSchema = z.object({
  email: z.string().email(),
  password: z.string(),
});

export type SignInDto = z.infer<typeof signInDtoSchema>;

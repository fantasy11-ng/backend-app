import { z } from 'zod';

export const signUpDtoSchema = z.object({
  fullName: z.string(),
  email: z.string().email(),
  phone: z.string(),
  password: z.string(),
});

export type SignUpDto = z.infer<typeof signUpDtoSchema>;

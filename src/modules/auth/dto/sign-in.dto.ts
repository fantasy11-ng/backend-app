import { z } from 'zod';

export const signInDtoSchema = z.object({
  email: z.string().email(),
  password: z.string(),
});

export class SignInDto {
  email: string;
  password: string;
}

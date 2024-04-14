import { z } from 'zod';

export const signUpDtoSchema = z.object({
  email: z.string().email(),
  password: z.string(),
});

export class SignUpDto {
  email: string;
  password: string;
}

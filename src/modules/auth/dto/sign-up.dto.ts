import { z } from 'zod';

export const signUpDtoSchema = z.object({
  firstName: z.string().min(1),
  lastName: z.string().min(1),
  email: z.string().email(),
  password: z.string(),
});

export class SignUpDto {
  firstName: string;
  lastName: string;
  email: string;
  password: string;
}

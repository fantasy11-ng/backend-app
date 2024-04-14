import { z } from 'zod';

export const requestPasswordResetDtoSchema = z.object({
  email: z.string().email(),
});

export class RequestPasswordResetDto {
  email: string;
}

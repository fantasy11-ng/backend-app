import { z } from 'zod';

export const refreshAccessTokenDtoSchema = z.object({
  refreshToken: z.string(),
});

export class RefreshAccessTokenDto {
  refreshToken: string;
}

import { z } from 'zod';

export const refreshAccessTokenDtoSchema = z.object({
  refreshToken: z.string(),
});

export type RefreshAccessTokenDto = z.infer<typeof refreshAccessTokenDtoSchema>;

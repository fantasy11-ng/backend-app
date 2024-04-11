import { ApiProperty } from '@nestjs/swagger';
import { z } from 'zod';

export const createTeamDtoSchema = z.object({
  logoUrl: z.string().url(),
  name: z.string(),
  squad: z
    .array(
      z.object({
        id: z.number(),
        sidelined: z.boolean(),
      }),
    )
    .max(20),
});

class CreateTeamSquadPlayer {
  id: number;
  sidelined: boolean;
}
export class CreateTeamDto implements z.infer<typeof createTeamDtoSchema> {
  logoUrl: string;
  name: string;
  @ApiProperty({ type: () => CreateTeamSquadPlayer })
  squad: CreateTeamSquadPlayer[];
}

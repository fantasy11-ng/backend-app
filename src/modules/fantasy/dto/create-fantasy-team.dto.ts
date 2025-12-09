import { ApiProperty } from '@nestjs/swagger';
import { z } from 'zod';

export const createFantasyTeamSchema = z.object({
  logoUrl: z.string().url().optional(),
  name: z.string().min(1),
});

export class CreateFantasyTeamDto
  implements z.infer<typeof createFantasyTeamSchema>
{
  @ApiProperty({ required: false })
  logoUrl?: string;

  @ApiProperty()
  name: string;

  // Squad is created separately after team creation
}

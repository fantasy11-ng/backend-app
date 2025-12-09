import { ApiProperty } from '@nestjs/swagger';
import { z } from 'zod';

export const createFantasyLeagueSchema = z.object({
  name: z.string().min(3).max(100),
  isPublic: z.boolean().optional(),
});

export class CreateFantasyLeagueDto
  implements z.infer<typeof createFantasyLeagueSchema>
{
  @ApiProperty({
    description: 'Name of the league',
    minLength: 3,
    maxLength: 100,
  })
  name: string;

  @ApiProperty({
    required: false,
    description:
      'Whether the league is public. If omitted or false, the league is private and uses an invite code.',
  })
  isPublic?: boolean;
}



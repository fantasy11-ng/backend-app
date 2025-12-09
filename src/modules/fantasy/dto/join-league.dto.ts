import { ApiProperty } from '@nestjs/swagger';
import { z } from 'zod';

export const joinLeagueByCodeSchema = z.object({
  inviteCode: z.string().trim().length(10),
});

export class JoinLeagueByCodeDto
  implements z.infer<typeof joinLeagueByCodeSchema>
{
  @ApiProperty({
    description: '10-character invite code for a private league',
    minLength: 10,
    maxLength: 10,
  })
  inviteCode: string;
}



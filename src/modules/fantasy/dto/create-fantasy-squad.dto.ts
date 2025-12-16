import { ApiProperty } from '@nestjs/swagger';
import { z } from 'zod';

export const createFantasySquadSchema = z.object({
  formation: z.string(),
  squad: z
    .array(
      z.object({
        playerId: z.number(),
        isStarting: z.boolean(),
        isCaptain: z.boolean().optional(),
        isViceCaptain: z.boolean().optional(),
        isPenaltyTaker: z.boolean().optional(),
        isFreeKickTaker: z.boolean().optional(),
      }),
    )
    .length(15),
});

class SquadPlayerDto {
  @ApiProperty()
  playerId: number;

  @ApiProperty()
  isStarting: boolean;

  @ApiProperty({ required: false })
  isCaptain?: boolean;

  @ApiProperty({ required: false })
  isViceCaptain?: boolean;

  @ApiProperty({ required: false })
  isPenaltyTaker?: boolean;

  @ApiProperty({ required: false })
  isFreeKickTaker?: boolean;
}

export class CreateFantasySquadDto
  implements z.infer<typeof createFantasySquadSchema>
{
  @ApiProperty({
    description: 'Any valid football formation string (GK is implied).',
    examples: ['4-4-2', '4-2-3-1', '3-4-3'],
  })
  formation: string;

  @ApiProperty({ type: () => SquadPlayerDto, isArray: true })
  squad: SquadPlayerDto[];
}

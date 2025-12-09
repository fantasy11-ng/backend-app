import { ApiProperty } from '@nestjs/swagger';
import { z } from 'zod';
import { FormationCode } from '@/common/config/fantasy.config';

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
  @ApiProperty({ enum: Object.values(FormationCode) })
  formation: FormationCode;

  @ApiProperty({ type: () => SquadPlayerDto, isArray: true })
  squad: SquadPlayerDto[];
}

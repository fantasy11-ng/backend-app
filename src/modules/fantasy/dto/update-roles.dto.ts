import { ApiProperty } from '@nestjs/swagger';
import { z } from 'zod';

export const updateRolesSchema = z.object({
  // Use stable Player IDs (NOT FantasySquadPlayer IDs) so role updates work across squad snapshots
  captainId: z.number().optional(),
  viceCaptainId: z.number().optional(),
  penaltyTakerId: z.number().optional(),
  freeKickTakerId: z.number().optional(),
});

export class UpdateRolesDto implements z.infer<typeof updateRolesSchema> {
  @ApiProperty({ required: false })
  captainId?: number;

  @ApiProperty({ required: false })
  viceCaptainId?: number;

  @ApiProperty({ required: false })
  penaltyTakerId?: number;

  @ApiProperty({ required: false })
  freeKickTakerId?: number;
}

import { ApiProperty } from '@nestjs/swagger';
import { z } from 'zod';

export const updateRolesSchema = z
  .object({
    // Use stable Player IDs (NOT FantasySquadPlayer IDs) so role updates work across squad snapshots
    captainId: z.number().optional(),
    viceCaptainId: z.number().optional(),
    penaltyTakerId: z.number().optional(),
    freeKickTakerId: z.number().optional(),
  })
  .superRefine((val, ctx) => {
    // A player may take multiple set-piece roles, but cannot be both captain and vice-captain.
    if (
      val.captainId !== undefined &&
      val.viceCaptainId !== undefined &&
      val.captainId === val.viceCaptainId
    ) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ['viceCaptainId'],
        message: 'Vice-captain must be different from captain',
      });
    }
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

import { ApiProperty } from '@nestjs/swagger';
import { z } from 'zod';

export const updateRolesSchema = z.object({
  captainId: z.string().uuid().optional(),
  viceCaptainId: z.string().uuid().optional(),
  penaltyTakerId: z.string().uuid().optional(),
  freeKickTakerId: z.string().uuid().optional(),
});

export class UpdateRolesDto implements z.infer<typeof updateRolesSchema> {
  @ApiProperty({ required: false })
  captainId?: string;

  @ApiProperty({ required: false })
  viceCaptainId?: string;

  @ApiProperty({ required: false })
  penaltyTakerId?: string;

  @ApiProperty({ required: false })
  freeKickTakerId?: string;
}

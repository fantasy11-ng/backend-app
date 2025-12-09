import { ApiProperty } from '@nestjs/swagger';
import { z } from 'zod';
import { FantasyBoostType } from '../fantasy.types';

export const applyBoostSchema = z.object({
  type: z.nativeEnum(FantasyBoostType),
});

export class ApplyBoostDto implements z.infer<typeof applyBoostSchema> {
  @ApiProperty({ enum: FantasyBoostType })
  type: FantasyBoostType;
}

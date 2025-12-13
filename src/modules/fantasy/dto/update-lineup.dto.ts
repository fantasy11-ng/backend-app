import { ApiProperty } from '@nestjs/swagger';
import { z } from 'zod';

export const updateLineupSchema = z.object({
  formation: z.string(),
  // Use stable Player IDs (NOT FantasySquadPlayer IDs) so lineup updates work across squad snapshots
  startingPlayerIds: z.array(z.number()).length(11),
  benchPlayerIds: z.array(z.number()).length(4),
});

export class UpdateLineupDto implements z.infer<typeof updateLineupSchema> {
  @ApiProperty()
  formation: string;

  @ApiProperty({ type: Number, isArray: true })
  startingPlayerIds: number[];

  @ApiProperty({ type: Number, isArray: true })
  benchPlayerIds: number[];
}

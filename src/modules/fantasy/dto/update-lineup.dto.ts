import { ApiProperty } from '@nestjs/swagger';
import { z } from 'zod';

export const updateLineupSchema = z.object({
  formation: z.string(),
  startingPlayerIds: z.array(z.string().uuid()).length(11),
  benchPlayerIds: z.array(z.string().uuid()).length(4),
  fixtureId: z.number().optional(),
});

export class UpdateLineupDto implements z.infer<typeof updateLineupSchema> {
  @ApiProperty()
  formation: string;

  @ApiProperty({ type: String, isArray: true })
  startingPlayerIds: string[];

  @ApiProperty({ type: String, isArray: true })
  benchPlayerIds: string[];

  @ApiProperty({ required: false })
  fixtureId?: number;
}

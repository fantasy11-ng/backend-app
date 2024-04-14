import { ApiProperty } from '@nestjs/swagger';
import { z } from 'zod';

export const createPredictionDtoSchema = z.object({
  groupId: z.number(),
  stageId: z.number(),
  teams: z.array(
    z.object({
      index: z.number(),
      id: z.number(),
    }),
  ),
  winnerId: z.number(),
  runnerUpId: z.number(),
});

class CreatePredictionTeam {
  index: number;
  id: number;
}
export class CreatePredictionDto {
  stageId: number;
  groupId: number;
  @ApiProperty({ type: () => CreatePredictionTeam })
  teams: CreatePredictionTeam[];
  winnerId: number;
  runnerUpId: number;
}

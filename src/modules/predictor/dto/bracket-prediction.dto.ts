import { ApiProperty } from '@nestjs/swagger';
import { z } from 'zod';

export const bracketPredictionItemSchema = z.object({
  externalFixtureId: z.number(),
  predictedWinnerTeamId: z.number(),
});

export const bracketPredictionDtoSchema = z.object({
  predictions: z.array(bracketPredictionItemSchema).min(1),
});

class BracketPredictionItem {
  externalFixtureId: number;
  predictedWinnerTeamId: number;
}

export class BracketPredictionDto {
  @ApiProperty({ type: () => BracketPredictionItem, isArray: true })
  predictions: BracketPredictionItem[];
}

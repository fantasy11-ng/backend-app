import { ApiProperty } from '@nestjs/swagger';
import { z } from 'zod';

export const thirdPlaceMatchDtoSchema = z.object({
  externalFixtureId: z.number(),
  predictedWinnerTeamId: z.number(),
});

export class ThirdPlaceMatchDto {
  @ApiProperty()
  externalFixtureId: number;
  @ApiProperty()
  predictedWinnerTeamId: number;
}

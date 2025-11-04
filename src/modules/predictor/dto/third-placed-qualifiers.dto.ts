import { ApiProperty } from '@nestjs/swagger';
import { z } from 'zod';

export const thirdPlacedQualifiersSchema = z.object({
  ranking: z.array(z.number()).min(1),
});

export class ThirdPlacedQualifiersDto {
  @ApiProperty({ type: Number, isArray: true })
  ranking: number[];
}

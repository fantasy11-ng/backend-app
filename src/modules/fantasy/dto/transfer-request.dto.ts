import { ApiProperty } from '@nestjs/swagger';
import { z } from 'zod';

export const transferItemSchema = z.object({
  playerOutId: z.number().optional(),
  playerInId: z.number(),
});

export const transferRequestSchema = z.object({
  fixtureId: z.number().optional(),
  transfers: z.array(transferItemSchema).min(1),
});

class TransferItemDto {
  @ApiProperty({ required: false })
  playerOutId?: number;

  @ApiProperty()
  playerInId: number;
}

export class TransferRequestDto
  implements z.infer<typeof transferRequestSchema>
{
  @ApiProperty({ required: false })
  fixtureId?: number;

  @ApiProperty({ type: () => TransferItemDto, isArray: true })
  transfers: TransferItemDto[];
}

import { z } from 'zod';

export const setMainServiceLeagueDtoSchema = z.object({
  leagueId: z.number(),
});

export class SetMainServiceLeagueDto {
  leagueId: number;
}

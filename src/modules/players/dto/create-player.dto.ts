import { z } from 'zod';

export const createPlayerDtoSchema = z.object({});

export class CreatePlayerDto {
  name: string;
  commonName: string;
  image: string;
  pool: string;

  externalId: number;

  positionId: number;
  position: {
    id: number;
    name: string;
    code: string;
    developer_name: string;
  };

  countryId: number;
  rating?: number;
  points?: number;
  minutesPlayed?: number | null;
  appearances?: number | null;
  lineups?: number | null;
  starts?: number | null;
  bench?: number | null;
  shotsOnTarget?: number | null;
  keyPasses?: number | null;
}

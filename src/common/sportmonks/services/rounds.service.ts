import { HttpService } from '@nestjs/axios';
import { BadGatewayException, Injectable } from '@nestjs/common';
import { firstValueFrom } from 'rxjs';
import { SportmonksResponse } from '../types/response.type';
import { SportmonksRound } from '../types/rounds.types';

@Injectable()
export class SportmonksRoundsService {
  constructor(private http: HttpService) {}

  async getRoundsBySeasonId(seasonId: number): Promise<SportmonksRound[]> {
    try {
      const { data } = await firstValueFrom(
        this.http.get<SportmonksResponse<SportmonksRound[]>>(
          `/football/rounds/seasons/${seasonId}`,
        ),
      );

      return data.data || [];
    } catch (e) {
      throw new BadGatewayException(
        `Error fetching rounds for season ${seasonId}: ${e.message}`,
      );
    }
  }
}

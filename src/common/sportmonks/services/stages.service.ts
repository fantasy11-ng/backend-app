import { HttpService } from '@nestjs/axios';
import { BadGatewayException, Injectable } from '@nestjs/common';
import { firstValueFrom } from 'rxjs';
import { SportmonksResponse } from '../types/response.type';
import { SportmonksStage } from '../types/stages.type';

@Injectable()
export class SportmonksStagesService {
  constructor(private http: HttpService) {}

  async getSeasonStages(seasonId: number) {
    try {
      const response = await firstValueFrom(
        this.http.get<SportmonksResponse<SportmonksStage[]>>(
          `/football/stages/seasons/${seasonId}`,
          {
            params: {
              include: 'type;rounds;currentRound;groups;fixtures.participants',
            },
          },
        ),
      );

      return response.data;
    } catch (e) {
      throw new BadGatewayException(e);
    }
  }
}

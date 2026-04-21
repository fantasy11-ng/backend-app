import { HttpService } from '@nestjs/axios';
import {
  BadGatewayException,
  BadRequestException,
  Injectable,
} from '@nestjs/common';
import { firstValueFrom } from 'rxjs';
import { SportmonksPlayer } from '../types/players.types';
import { SportmonksResponse } from '../types/response.type';
import { SportmonksCoreService } from './core.service';
import { SportmonksCountry } from '../types/countries.type';

@Injectable()
export class SportmonksPlayersService {
  constructor(
    private http: HttpService,
    private smCoreService: SportmonksCoreService,
  ) {}

  async getPlayerById(
    playerId: number,
    options?: {
      include?: string;
      filters?: string;
    },
  ) {
    try {
      const { data } = await firstValueFrom(
        this.http.get<SportmonksResponse<SportmonksPlayer>>(
          `/football/players/${playerId}`,
          {
            params: {
              include: options?.include ?? 'position',
              filters: options?.filters,
            },
          },
        ),
      );

      return data.data as SportmonksPlayer;
    } catch (e) {
      throw new BadGatewayException(`Error fetching player ${playerId}`);
    }
  }

  async getCountries(): Promise<SportmonksCountry[]> {
    return await this.smCoreService.getCountries();
  }

  async getPlayersBySeason(seasonId: number) {
    const { data } = await firstValueFrom(
      this.http.get<SportmonksResponse<SportmonksPlayer>>(
        `/football/teams/seasons/${seasonId}`,
        {
          params: {
            include: 'players.position;sidelined',
          },
        },
      ),
    );

    return data.data;
  }

  async getPlayers<T>(options?: {
    countryId?: number;
    seasonId?: number;
    page: number;
    limit: number;
  }) {
    const { countryId, seasonId, page, limit } = options;

    if (!countryId && !seasonId) {
      throw new BadRequestException(
        'Invalid Request: please provide country or season',
      );
    }

    const path = countryId
      ? `/football/players/countries/${countryId}`
      : `/football/teams/seasons/${seasonId}`;
    const include = countryId
      ? ''
      : 'players.position;sidelined;players.player.position';
    try {
      const data = await firstValueFrom(
        this.http.get<SportmonksResponse<T[]>>(path, {
          params: {
            per_page: limit,
            page,
            include,
          },
        }),
      );

      return data.data;
    } catch (e) {
      throw new BadGatewayException(
        `Error getting players for season: ${seasonId}`,
      );
    }
  }
}

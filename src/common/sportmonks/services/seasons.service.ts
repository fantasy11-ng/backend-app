import { HttpService } from '@nestjs/axios';
import { BadGatewayException, Injectable } from '@nestjs/common';
import { firstValueFrom } from 'rxjs';
import { SportmonksResponse } from '../types/response.type';

@Injectable()
export class SportmonksSeasonsService {
  constructor(private http: HttpService) {}

  async getSeasonById(seasonId: number) {
    try {
      const { data } = await firstValueFrom(
        this.http.get<SportmonksResponse<any>>(
          `/football/seasons/${seasonId}`,
          {
            params: {
              include: 'league',
            },
          },
        ),
      );
      return data.data;
    } catch (e) {
      throw new BadGatewayException(e);
    }
  }
}

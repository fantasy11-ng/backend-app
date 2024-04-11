import { HttpService } from '@nestjs/axios';
import { Injectable } from '@nestjs/common';
import { firstValueFrom } from 'rxjs';
import { SportmonksCountry } from '../types/countries.type';
import { SportmonksResponse } from '../types/response.type';

@Injectable()
export class SportmonksCoreService {
  constructor(private http: HttpService) {}

  async getCountries() {
    const { data } = await firstValueFrom(
      this.http.get<SportmonksResponse<SportmonksCountry[]>>('/core/countries'),
    );

    return data.data;
  }
}

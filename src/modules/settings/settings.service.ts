import { BadGatewayException, Injectable } from '@nestjs/common';
import { SportmonksLeaguesService } from 'src/common/sportmonks/services/leagues.service';
import { SetMainServiceLeagueDto } from './dto/set-main-service-league.dto';
import { DataSource } from 'typeorm';
import { InjectDataSource } from '@nestjs/typeorm';
import { ServiceLeague } from 'src/common/sportmonks/entities/service-league.entity';
import { ServiceSeason } from 'src/common/sportmonks/entities/service-season.entity';

@Injectable()
export class SettingsService {
  constructor(
    private sportmonksLeaguesService: SportmonksLeaguesService,
    @InjectDataSource() private db: DataSource,
  ) {}

  async resetServiceLeagues() {
    const serviceLeagueRepo = this.db.getRepository(ServiceLeague);
    await serviceLeagueRepo
      .createQueryBuilder()
      .update(ServiceLeague)
      .set({ isMain: false })
      .where('isMain = :isMain', { isMain: true })
      .execute();
  }

  async setMainServiceLeague(dto: SetMainServiceLeagueDto) {
    const serviceLeagueRepo = this.db.getRepository(ServiceLeague);

    const league = await this.sportmonksLeaguesService.getLeagueById({
      leagueId: dto.leagueId,
      includes: ['currentSeason'],
    });

    if (!league) {
      throw new BadGatewayException('An error occured getting service league');
    } else if (!league.currentseason) {
      throw new BadGatewayException('Invalid league: no current season');
    }

    await this.resetServiceLeagues();

    const serviceSeason = new ServiceSeason();
    serviceSeason.serviceId = league.currentseason.id;
    serviceSeason.name = league.currentseason.name;
    serviceSeason.externalLeagueId = league.id;

    const serviceLeague = new ServiceLeague();
    serviceLeague.isMain = true;
    serviceLeague.name = league.name;
    serviceLeague.imageUrl = league.image_path;
    serviceLeague.serviceId = league.id;
    serviceLeague.lastPlayedAt = new Date(league.last_played_at);
    serviceLeague.countryId = league.country_id;
    serviceLeague.currentSeason = serviceSeason;

    return await serviceLeagueRepo.save(serviceLeague);
  }

  async getMainServiceLeague() {
    const serviceLeagueRepo = this.db.getRepository(ServiceLeague);

    return await serviceLeagueRepo.findOne({
      where: { isMain: true },
      relations: ['currentSeason'],
    });
  }
}

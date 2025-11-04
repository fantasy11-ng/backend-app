import { BadGatewayException, Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { MainConfig } from '@/common/config/main.config';
import { SportmonksLeaguesService } from 'src/common/sportmonks/services/leagues.service';
import { SportmonksSeasonsService } from 'src/common/sportmonks/services/seasons.service';
import { SetMainServiceLeagueDto } from './dto/set-main-service-league.dto';
import { DataSource } from 'typeorm';
import { InjectDataSource } from '@nestjs/typeorm';
import { ServiceLeague } from 'src/common/sportmonks/entities/service-league.entity';
import { ServiceSeason } from 'src/common/sportmonks/entities/service-season.entity';

@Injectable()
export class SettingsService {
  constructor(
    private configService: ConfigService<MainConfig>,
    private sportmonksLeaguesService: SportmonksLeaguesService,
    private sportmonksSeasonsService: SportmonksSeasonsService,
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

    // Respect season override from env
    const overrideSeasonId = this.configService.get(
      'predictor.seasonOverride',
      { infer: true },
    );
    if (overrideSeasonId) {
      await this.ensureSeasonAsMain(Number(overrideSeasonId));
    }

    return await serviceLeagueRepo.findOne({
      where: { isMain: true },
      relations: ['currentSeason'],
    });
  }

  private async ensureSeasonAsMain(seasonId: number) {
    const serviceLeagueRepo = this.db.getRepository(ServiceLeague);
    const serviceSeasonRepo = this.db.getRepository(ServiceSeason);

    // If already present and main, skip
    const existingMain = await serviceLeagueRepo.findOne({
      where: { isMain: true },
      relations: ['currentSeason'],
    });
    if (existingMain?.currentSeason?.serviceId === seasonId) return;

    // Check if season exists locally
    let season = await serviceSeasonRepo.findOne({
      where: { serviceId: seasonId },
    });

    let league: any = null;
    if (!season) {
      // Fetch from SportMonks and persist league + season
      const smSeason =
        await this.sportmonksSeasonsService.getSeasonById(seasonId);
      if (!smSeason) throw new BadGatewayException('Invalid season override');

      season = new ServiceSeason();
      season.serviceId = smSeason.id;
      season.name = smSeason.name;
      season.externalLeagueId = smSeason.league_id || smSeason.league?.id;
      await serviceSeasonRepo.save(season);

      league = smSeason.league || {};
    } else {
      // Try to find its league
      league = await serviceLeagueRepo.findOne({
        where: { serviceId: season.externalLeagueId },
      });
    }

    // Set this season's league as main
    await this.resetServiceLeagues();

    const serviceLeague = new ServiceLeague();
    serviceLeague.isMain = true;
    serviceLeague.name = league?.name || 'League';
    serviceLeague.imageUrl = league?.image_path || '';
    serviceLeague.serviceId = league?.id || season.externalLeagueId;
    serviceLeague.lastPlayedAt = league?.last_played_at
      ? new Date(league.last_played_at)
      : new Date();
    serviceLeague.countryId = league?.country_id || 0;
    serviceLeague.currentSeason = season;

    await serviceLeagueRepo.save(serviceLeague);
  }
}

import { BadGatewayException, Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { MainConfig } from '@/common/config/main.config';
import { SportmonksLeaguesService } from '@/common/sportmonks/services/leagues.service';
import { SportmonksSeasonsService } from '@/common/sportmonks/services/seasons.service';
import { SetMainServiceLeagueDto } from './dto/set-main-service-league.dto';
import { DataSource } from 'typeorm';
import { InjectDataSource } from '@nestjs/typeorm';
import { ServiceLeague } from '@/common/sportmonks/entities/service-league.entity';
import { ServiceSeason } from '@/common/sportmonks/entities/service-season.entity';

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
    const serviceSeasonRepo = this.db.getRepository(ServiceSeason);

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

    // Upsert season (by Sportmonks season id)
    let serviceSeason = await serviceSeasonRepo.findOne({
      where: { serviceId: league.currentseason.id },
    });
    if (!serviceSeason) {
      serviceSeason = new ServiceSeason();
      serviceSeason.serviceId = league.currentseason.id;
    }
    serviceSeason.name = league.currentseason.name;
    serviceSeason.externalLeagueId = league.id;
    serviceSeason = await serviceSeasonRepo.save(serviceSeason);

    // Upsert league row:
    // - Prefer by league serviceId (Sportmonks league id)
    // - Fallback: if an existing row already references this season, reuse it to avoid 1:1 constraint violation
    const existing = await serviceLeagueRepo
      .createQueryBuilder('l')
      .leftJoinAndSelect('l.currentSeason', 's')
      .where('l.serviceId = :leagueId', { leagueId: league.id })
      .orWhere('s.serviceId = :seasonId', { seasonId: serviceSeason.serviceId })
      .getOne();

    const serviceLeague = existing ?? new ServiceLeague();
    serviceLeague.isMain = true;
    serviceLeague.name = league.name;
    serviceLeague.imageUrl = league.image_path || '';
    serviceLeague.serviceId = league.id;
    serviceLeague.lastPlayedAt = new Date(league.last_played_at);
    serviceLeague.countryId = league.country_id || 0;
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
      season = await serviceSeasonRepo.save(season);

      league = smSeason.league || {};
    } else {
      // Try to find its league
      league = await serviceLeagueRepo.findOne({
        where: { serviceId: season.externalLeagueId },
      });
    }

    // Set this season's league as main
    await this.resetServiceLeagues();

    const existing = await serviceLeagueRepo
      .createQueryBuilder('l')
      .leftJoinAndSelect('l.currentSeason', 's')
      .where('l.serviceId = :leagueId', {
        leagueId: league?.id || season.externalLeagueId,
      })
      .orWhere('s.serviceId = :seasonId', { seasonId: season.serviceId })
      .getOne();

    const serviceLeague = existing ?? new ServiceLeague();
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

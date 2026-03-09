import { Injectable, Logger } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { FantasyTeamRanking } from './entities/fantasy-team-ranking.entity';
import { FantasyTeam } from './entities/fantasy-team.entity';
import { CompetitionLeaderboardArchive } from './entities/competition-leaderboard-archive.entity';
import { FantasySquadPlayer } from './entities/fantasy-squad-player.entity';
import { FantasyPoints } from './entities/fantasy-points.entity';
import { FantasyTransfer } from './entities/fantasy-transfer.entity';
import { FantasyBoost } from './entities/fantasy-boost.entity';
import { FantasySquad } from './entities/fantasy-squad.entity';
import { FantasyLeagueMembership } from './entities/fantasy-league-membership.entity';
import { FantasyTeamEvent } from './entities/fantasy-team-event.entity';
import { FantasyLeague } from './entities/fantasy-league.entity';
import { FantasyGameweek } from './entities/fantasy-gameweek.entity';
import { Fixture } from '@/modules/stages/entities/fixture.entity';
import { PlayerFixtureStats } from '@/modules/players/entities/player-fixture-stats.entity';
import { Player } from '@/modules/players/entities/player.entity';
import { FixturePrediction } from '@/modules/predictor/entities/fixture-prediction.entity';
import { ThirdPlaceMatchPrediction } from '@/modules/predictor/entities/third-place-match-prediction.entity';
import { ThirdPlaceQualifiersInput } from '@/modules/predictor/entities/third-place-qualifiers-input.entity';
import { Prediction } from '@/modules/predictor/entities/prediction.entity';
import { Stage } from '@/modules/stages/entities/stage.entity';
import { Group } from '@/modules/stages/entities/group.entity';
import { FootballTeam } from '@/modules/team/entities/football-team.entity';
import { SettingsService } from '@/modules/settings/settings.service';
import type { LeaderboardEntry } from './entities/competition-leaderboard-archive.entity';

@Injectable()
export class TournamentResetService {
  private readonly logger = new Logger(TournamentResetService.name);

  constructor(
    @InjectRepository(FantasyTeamRanking)
    private readonly rankingRepo: Repository<FantasyTeamRanking>,
    @InjectRepository(FantasyTeam)
    private readonly teamRepo: Repository<FantasyTeam>,
    @InjectRepository(CompetitionLeaderboardArchive)
    private readonly archiveRepo: Repository<CompetitionLeaderboardArchive>,
    @InjectRepository(FantasySquadPlayer)
    private readonly squadPlayerRepo: Repository<FantasySquadPlayer>,
    @InjectRepository(FantasyPoints)
    private readonly pointsRepo: Repository<FantasyPoints>,
    @InjectRepository(FantasyTransfer)
    private readonly transferRepo: Repository<FantasyTransfer>,
    @InjectRepository(FantasyBoost)
    private readonly boostRepo: Repository<FantasyBoost>,
    @InjectRepository(FantasySquad)
    private readonly squadRepo: Repository<FantasySquad>,
    @InjectRepository(FantasyLeagueMembership)
    private readonly membershipRepo: Repository<FantasyLeagueMembership>,
    @InjectRepository(FantasyTeamEvent)
    private readonly teamEventRepo: Repository<FantasyTeamEvent>,
    @InjectRepository(FantasyLeague)
    private readonly leagueRepo: Repository<FantasyLeague>,
    @InjectRepository(FantasyGameweek)
    private readonly gameweekRepo: Repository<FantasyGameweek>,
    @InjectRepository(Fixture)
    private readonly fixtureRepo: Repository<Fixture>,
    @InjectRepository(PlayerFixtureStats)
    private readonly pfsRepo: Repository<PlayerFixtureStats>,
    @InjectRepository(Player)
    private readonly playerRepo: Repository<Player>,
    @InjectRepository(FixturePrediction)
    private readonly fixturePredictionRepo: Repository<FixturePrediction>,
    @InjectRepository(ThirdPlaceMatchPrediction)
    private readonly thirdPlaceMatchRepo: Repository<ThirdPlaceMatchPrediction>,
    @InjectRepository(ThirdPlaceQualifiersInput)
    private readonly thirdPlaceInputRepo: Repository<ThirdPlaceQualifiersInput>,
    @InjectRepository(Prediction)
    private readonly predictionRepo: Repository<Prediction>,
    @InjectRepository(Stage)
    private readonly stageRepo: Repository<Stage>,
    @InjectRepository(Group)
    private readonly groupRepo: Repository<Group>,
    @InjectRepository(FootballTeam)
    private readonly footballTeamRepo: Repository<FootballTeam>,
    private readonly settingsService: SettingsService,
  ) {}

  /**
   * Archives the top 10 global fantasy leaderboard for the current competition.
   * Call this before resetForNewTournament.
   */
  async archiveTop10Leaderboard(
    competitionName: string,
    externalSeasonId: number,
  ): Promise<CompetitionLeaderboardArchive> {
    const rankings = await this.rankingRepo.find({
      where: { fixtureId: 0 },
      relations: ['team', 'team.owner'],
      order: { rank: 'ASC' },
      take: 10,
    });

    const topEntries: LeaderboardEntry[] = rankings.map((r) => ({
      rank: r.rank,
      teamName: r.team?.name ?? '',
      ownerId: r.team?.ownerId ?? '',
      ownerName: r.team?.owner?.fullName ?? '',
      totalPoints: r.totalPoints ?? 0,
      goals: r.goals ?? 0,
      assists: r.assists ?? 0,
      saves: r.saves ?? 0,
      yellowCards: r.yellowCards ?? 0,
      redCards: r.redCards ?? 0,
      ownGoals: r.ownGoals ?? 0,
      cleanSheets: r.cleanSheets ?? 0,
    }));

    const archive = this.archiveRepo.create({
      competitionName,
      externalSeasonId,
      topEntries,
    });

    return await this.archiveRepo.save(archive);
  }

  /**
   * Resets all competition-related data. Users are retained.
   * Call archiveTop10Leaderboard first if you want to preserve the leaderboard.
   */
  async resetForNewTournament(): Promise<{ deleted: Record<string, number> }> {
    const deleted: Record<string, number> = {};

    // TypeORM delete({}) rejects empty criteria; use query builder for "delete all"
    const deleteAll = async <T>(
      repo: Repository<T>,
      entity: new () => T,
    ): Promise<number> => {
      const r = await repo.createQueryBuilder().delete().from(entity).execute();
      return r.affected ?? 0;
    };

    // 1. Fantasy – delete in dependency order (child tables first)
    deleted.fantasyPoints = await deleteAll(this.pointsRepo, FantasyPoints);
    deleted.fantasySquadPlayer = await deleteAll(
      this.squadPlayerRepo,
      FantasySquadPlayer,
    );
    deleted.fantasyTeamRanking = await deleteAll(
      this.rankingRepo,
      FantasyTeamRanking,
    );
    deleted.fantasyTransfer = await deleteAll(this.transferRepo, FantasyTransfer);
    deleted.fantasyBoost = await deleteAll(this.boostRepo, FantasyBoost);
    deleted.fantasySquad = await deleteAll(this.squadRepo, FantasySquad);
    deleted.fantasyLeagueMembership = await deleteAll(
      this.membershipRepo,
      FantasyLeagueMembership,
    );
    deleted.fantasyTeamEvent = await deleteAll(
      this.teamEventRepo,
      FantasyTeamEvent,
    );
    deleted.fantasyLeague = await deleteAll(this.leagueRepo, FantasyLeague);
    deleted.fantasyTeam = await deleteAll(this.teamRepo, FantasyTeam);

    // 2. Fixtures and gameweeks
    deleted.fixture = await deleteAll(this.fixtureRepo, Fixture);
    deleted.fantasyGameweek = await deleteAll(
      this.gameweekRepo,
      FantasyGameweek,
    );

    // 3. Players
    deleted.playerFixtureStats = await deleteAll(this.pfsRepo, PlayerFixtureStats);
    deleted.player = await deleteAll(this.playerRepo, Player);

    // 4. Predictor
    deleted.fixturePrediction = await deleteAll(
      this.fixturePredictionRepo,
      FixturePrediction,
    );
    deleted.thirdPlaceMatchPrediction = await deleteAll(
      this.thirdPlaceMatchRepo,
      ThirdPlaceMatchPrediction,
    );
    deleted.thirdPlaceQualifiersInput = await deleteAll(
      this.thirdPlaceInputRepo,
      ThirdPlaceQualifiersInput,
    );
    deleted.prediction = await deleteAll(this.predictionRepo, Prediction);

    // 5. Stages and groups
    deleted.stage = await deleteAll(this.stageRepo, Stage);
    deleted.group = await deleteAll(this.groupRepo, Group);

    // 6. Football teams (synced per competition)
    deleted.footballTeam = await deleteAll(
      this.footballTeamRepo,
      FootballTeam,
    );

    this.logger.log(`Tournament reset complete. Deleted: ${JSON.stringify(deleted)}`);
    return { deleted };
  }

  /**
   * Archives top 10 and resets for new tournament in one call.
   * Uses current main league for competition name and season ID.
   */
  async archiveAndReset(): Promise<{
    archive: CompetitionLeaderboardArchive | null;
    deleted: Record<string, number>;
  }> {
    const main = await this.settingsService.getMainServiceLeague();
    let archive: CompetitionLeaderboardArchive | null = null;

    if (main?.currentSeason) {
      const competitionName = main.name;
      const externalSeasonId = main.currentSeason.serviceId;

      const rankings = await this.rankingRepo.find({
        where: { fixtureId: 0 },
        relations: ['team', 'team.owner'],
        order: { rank: 'ASC' },
        take: 10,
      });

      if (rankings.length > 0) {
        const topEntries: LeaderboardEntry[] = rankings.map((r) => ({
          rank: r.rank,
          teamName: r.team?.name ?? '',
          ownerId: r.team?.ownerId ?? '',
          ownerName: r.team?.owner?.fullName ?? '',
          totalPoints: r.totalPoints ?? 0,
          goals: r.goals ?? 0,
          assists: r.assists ?? 0,
          saves: r.saves ?? 0,
          yellowCards: r.yellowCards ?? 0,
          redCards: r.redCards ?? 0,
          ownGoals: r.ownGoals ?? 0,
          cleanSheets: r.cleanSheets ?? 0,
        }));

        archive = await this.archiveRepo.save(
          this.archiveRepo.create({
            competitionName,
            externalSeasonId,
            topEntries,
          }),
        );
        this.logger.log(
          `Archived top ${rankings.length} for ${competitionName} (season ${externalSeasonId})`,
        );
      }
    } else {
      this.logger.warn('No main league configured; skipping archive');
    }

    const { deleted } = await this.resetForNewTournament();
    return { archive, deleted };
  }

  async getArchives(): Promise<CompetitionLeaderboardArchive[]> {
    return this.archiveRepo.find({
      order: { archivedAt: 'DESC' },
    });
  }

  async getArchiveById(id: string): Promise<CompetitionLeaderboardArchive | null> {
    return this.archiveRepo.findOne({ where: { id } });
  }
}

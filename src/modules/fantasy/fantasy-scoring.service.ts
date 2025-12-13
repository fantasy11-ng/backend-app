import { Inject, Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { In, Repository } from 'typeorm';
import { FantasyTeam } from './entities/fantasy-team.entity';
import { FantasySquad } from './entities/fantasy-squad.entity';
import { FantasySquadPlayer } from './entities/fantasy-squad-player.entity';
import { FantasyPoints } from './entities/fantasy-points.entity';
import { FantasyTeamRanking } from './entities/fantasy-team-ranking.entity';
import { ConfigService } from '@nestjs/config';
import { MainConfig } from '@/common/config/main.config';
import { FantasyConfig } from '@/common/config/fantasy.config';
import {
  MATCH_STATS_PROVIDER,
  MatchStatsProvider,
  PlayerMatchStats,
} from './match-stats.provider';
import { PositionCode } from './fantasy.types';
import { SportmonksFixturesService } from '@/common/sportmonks/services/fixtures.service';
import { FantasyGameweek } from './entities/fantasy-gameweek.entity';
import { FantasyBoost } from './entities/fantasy-boost.entity';
import { FantasyBoostType } from './fantasy.types';
import { Fixture } from '@/modules/stages/entities/fixture.entity';

@Injectable()
export class FantasyScoringService {
  private fantasyConfig: FantasyConfig;

  constructor(
    private readonly configService: ConfigService<MainConfig>,
    @InjectRepository(FantasyTeam)
    private readonly teamRepo: Repository<FantasyTeam>,
    @InjectRepository(FantasySquad)
    private readonly squadRepo: Repository<FantasySquad>,
    @InjectRepository(FantasySquadPlayer)
    private readonly squadPlayerRepo: Repository<FantasySquadPlayer>,
    @InjectRepository(FantasyPoints)
    private readonly pointsRepo: Repository<FantasyPoints>,
    @InjectRepository(FantasyTeamRanking)
    private readonly rankingRepo: Repository<FantasyTeamRanking>,
    @InjectRepository(Fixture)
    private readonly fixtureRepo: Repository<Fixture>,
    @InjectRepository(FantasyGameweek)
    private readonly gameweekRepo: Repository<FantasyGameweek>,
    @InjectRepository(FantasyBoost)
    private readonly boostRepo: Repository<FantasyBoost>,
    @Inject(MATCH_STATS_PROVIDER)
    private readonly statsProvider: MatchStatsProvider,
    private readonly fixturesService: SportmonksFixturesService,
  ) {
    this.fantasyConfig = this.configService.get('fantasy', { infer: true })!;
  }

  async computeForFixture(fixtureId: number) {
    const serviceFixture = await this.fixturesService.getFixtureById(
      fixtureId,
      [],
    );

    const localFixture = await this.fixtureRepo.findOne({
      where: { id: fixtureId },
    });

    let gameweek: FantasyGameweek | null = null;
    if (localFixture?.gameweekId) {
      gameweek = await this.gameweekRepo.findOne({
        where: { id: localFixture.gameweekId },
      });
    }

    const fallbackKickoffMs =
      (serviceFixture.starting_at_timestamp || 0) * 1000 ||
      Date.parse(serviceFixture.starting_at);

    const snapshotDeadline =
      gameweek?.snapshotDeadlineAt || new Date(fallbackKickoffMs);

    const stats = await this.statsProvider.getStatsForFixture(fixtureId);
    if (!stats.length) return;

    const statsByPlayerId = new Map<number, PlayerMatchStats>();
    const playerIds: number[] = [];
    for (const s of stats) {
      statsByPlayerId.set(s.playerId, s);
      playerIds.push(s.playerId);
    }

    // No relevant fantasy players → nothing to score
    if (!playerIds.length) {
      console.warn(`No relevant fantasy players for fixture ${fixtureId}`);
      return;
    }

    // Performance: only load squads that actually contain players with stats,
    // and that are locked for the relevant gameweek. If for any reason a draft
    // squad wasn't locked, lock it now (idempotent).
    let candidateSquads: FantasySquad[] = [];

    if (gameweek) {
      await this.squadRepo
        .createQueryBuilder()
        .update(FantasySquad)
        .set({
          isLocked: true,
          isCurrent: false,
          lockedAt: snapshotDeadline,
        })
        .where('gameweekId = :gwId', { gwId: gameweek.id })
        .andWhere('isLocked = false')
        .andWhere('createdAt <= :snapshot', { snapshot: snapshotDeadline })
        .execute();

      candidateSquads = await this.squadRepo
        .createQueryBuilder('squad')
        .leftJoinAndSelect('squad.team', 'team')
        .leftJoinAndSelect('squad.players', 'sp')
        .leftJoinAndSelect('sp.player', 'player')
        .where('squad.gameweekId = :gwId', { gwId: gameweek.id })
        .andWhere('squad.isLocked = true')
        .andWhere('sp.playerId IN (:...playerIds)', { playerIds })
        .getMany();
    } else {
      // Fallback for fixtures without a gameweekId
      candidateSquads = await this.squadRepo
        .createQueryBuilder('squad')
        .leftJoinAndSelect('squad.team', 'team')
        .leftJoinAndSelect('squad.players', 'sp')
        .leftJoinAndSelect('sp.player', 'player')
        .where('squad.createdAt <= :snapshot', { snapshot: snapshotDeadline })
        .andWhere('sp.playerId IN (:...playerIds)', { playerIds })
        .getMany();
    }

    // For each team, pick the latest eligible snapshot
    const latestSquadByTeam = new Map<string, FantasySquad>();
    for (const squad of candidateSquads) {
      const existing = latestSquadByTeam.get(squad.teamId);
      const existingTs =
        (existing?.lockedAt || existing?.createdAt)?.getTime?.() ?? 0;
      const squadTs = (squad.lockedAt || squad.createdAt).getTime();
      if (!existing || squadTs > existingTs) {
        latestSquadByTeam.set(squad.teamId, squad);
      }
    }

    const squads = Array.from(latestSquadByTeam.values());

    // Load boosts for this gameweek and the participating teams (if any)
    const boostsByTeamId = new Map<string, FantasyBoostType>();
    if (gameweek && squads.length) {
      const teamIds = squads.map((s) => s.teamId);
      const boosts = await this.boostRepo.find({
        where: { gameweekId: gameweek.id, teamId: In(teamIds) as any },
      });
      for (const b of boosts) {
        boostsByTeamId.set(b.teamId, b.type);
      }
    }

    const pointsToSave: FantasyPoints[] = [];
    const totalsByTeamId = new Map<string, number>();

    for (const squad of squads) {
      const teamId = squad.teamId;
      const boostType = gameweek ? boostsByTeamId.get(teamId) : undefined;
      let teamTotal = 0;
      const startingPlayers = squad.players.filter((sp) => sp.isStarting);

      // Determine effective captain: if captain DNP, fall back to vice-captain if they played
      const captainSp = startingPlayers.find((sp) => sp.isCaptain);
      const captainStat = captainSp
        ? statsByPlayerId.get(captainSp.playerId)
        : undefined;

      let effectiveCaptainId: string | null = null;

      if (captainSp && captainStat) {
        effectiveCaptainId = captainSp.id;
      } else {
        const viceCaptainSp = startingPlayers.find((sp) => sp.isViceCaptain);
        const viceCaptainStat = viceCaptainSp
          ? statsByPlayerId.get(viceCaptainSp.playerId)
          : undefined;
        if (viceCaptainSp && viceCaptainStat) {
          effectiveCaptainId = viceCaptainSp.id;
        }
      }

      const viceCaptainSp = startingPlayers.find((sp) => sp.isViceCaptain);

      for (const sp of startingPlayers) {
        const stat = statsByPlayerId.get(sp.playerId);
        if (!stat) continue;

        const basePoints = this.calculateBasePoints(sp.position, stat);
        const bonusPoints = this.calculateBonusPoints(stat);
        const rolePoints = this.calculateRolePoints(sp, stat);

        let total = basePoints + bonusPoints + rolePoints;

        // Apply captain-related boosts
        if (boostType === FantasyBoostType.MAX_CAPTAIN) {
          const isCaptain = captainSp && sp.id === captainSp.id;
          const isVice = viceCaptainSp && sp.id === viceCaptainSp.id;
          if ((isCaptain || isVice) && stat.minutesPlayed > 0) {
            total *= 2;
          }
        } else {
          if (effectiveCaptainId && sp.id === effectiveCaptainId) {
            const multiplier =
              boostType === FantasyBoostType.TRIPLE_CAPTAIN ? 3 : 2;
            total *= multiplier;
          }
        }

        // Apply saves boost (3 points per save for goalkeeper)
        if (
          boostType === FantasyBoostType.SAVES_BOOST &&
          sp.position === 'GK' &&
          stat.saves > 0
        ) {
          total += 3 * stat.saves;
        }

        teamTotal += total;

        const fp = this.pointsRepo.create({
          teamId,
          squadPlayerId: sp.id,
          fixtureId,
          gameweekId: gameweek?.id,
          minutesPlayed: stat.minutesPlayed,
          goals: stat.goals,
          assists: stat.assists,
          saves: stat.saves,
          goalsConceded: stat.goalsConceded,
          yellowCards: stat.yellowCards,
          redCards: stat.redCards,
          ownGoals: stat.ownGoals,
          rating: stat.rating,
          cleanSheet: stat.cleanSheet,
          penaltyScored: stat.penaltyScored,
          penaltyMissed: stat.penaltyMissed,
          freeKickScored: stat.freeKickScored,
          basePoints,
          bonusPoints,
          rolePoints,
          totalPoints: total,
        });

        pointsToSave.push(fp);
      }

      totalsByTeamId.set(teamId, (totalsByTeamId.get(teamId) || 0) + teamTotal);
    }

    if (!pointsToSave.length) return;

    // Idempotent: clear previous points & rankings for fixture then re-insert
    await this.pointsRepo.delete({ fixtureId });
    await this.rankingRepo.delete({ fixtureId });

    await this.pointsRepo.save(pointsToSave);

    const teamTotals = Array.from(totalsByTeamId.entries()).sort(
      (a, b) => b[1] - a[1],
    );

    const rankings: FantasyTeamRanking[] = [];
    let currentRank = 1;
    let lastPoints: number | null = null;

    for (let i = 0; i < teamTotals.length; i++) {
      const [teamId, totalPoints] = teamTotals[i];

      if (lastPoints !== null && totalPoints < lastPoints) {
        currentRank = i + 1;
      }
      lastPoints = totalPoints;

      rankings.push(
        this.rankingRepo.create({
          teamId,
          fixtureId,
          totalPoints,
          rank: currentRank,
        }),
      );
    }

    await this.rankingRepo.save(rankings);

    // Rebuild gameweek rankings if we have a gameweek
    if (gameweek) {
      const gwRows = await this.pointsRepo
        .createQueryBuilder('p')
        .select('p.teamId', 'teamId')
        .addSelect('SUM(p.totalPoints)', 'totalPoints')
        .where('p.gameweekId = :gwId', { gwId: gameweek.id })
        .groupBy('p.teamId')
        .orderBy('totalPoints', 'DESC')
        .getRawMany<{ teamId: string; totalPoints: string }>();

      // Clear existing gameweek rankings for this gameweek
      await this.rankingRepo.delete({ gameweekId: gameweek.id });

      if (gwRows.length) {
        const gwTeamIds = gwRows.map((r) => r.teamId);
        const gwTeams = await this.teamRepo.find({
          where: { id: In(gwTeamIds) as any },
          relations: ['owner'],
        });
        const gwTeamById = new Map(gwTeams.map((t) => [t.id, t]));

        const gwRankings: FantasyTeamRanking[] = [];
        let gwCurrentRank = 1;
        let gwLastPoints: number | null = null;

        for (let i = 0; i < gwRows.length; i++) {
          const { teamId, totalPoints } = gwRows[i];
          const numericPoints = Number(totalPoints) || 0;

          if (gwLastPoints !== null && numericPoints < gwLastPoints) {
            gwCurrentRank = i + 1;
          }
          gwLastPoints = numericPoints;

          gwRankings.push(
            this.rankingRepo.create({
              teamId,
              fixtureId: -1, // denotes gameweek aggregate
              gameweekId: gameweek.id,
              totalPoints: numericPoints,
              rank: gwCurrentRank,
              team: gwTeamById.get(teamId),
            }),
          );
        }

        await this.rankingRepo.save(gwRankings);
      }
    }

    // Rebuild season rankings (fixtureId = 0) from all per-fixture rankings
    const seasonRows = await this.rankingRepo
      .createQueryBuilder('r')
      .select('r.teamId', 'teamId')
      .addSelect('SUM(r.totalPoints)', 'totalPoints')
      .where('r.fixtureId != :seasonFixtureId', { seasonFixtureId: 0 })
      .groupBy('r.teamId')
      .orderBy('totalPoints', 'DESC')
      .getRawMany<{ teamId: string; totalPoints: string }>();

    // Clear existing season rows
    await this.rankingRepo.delete({ fixtureId: 0 });

    if (seasonRows.length) {
      const teamIds = seasonRows.map((r) => r.teamId);
      const teams = await this.teamRepo.find({
        where: { id: In(teamIds) as any },
        relations: ['owner'],
      });
      const teamById = new Map(teams.map((t) => [t.id, t]));

      const seasonRankings: FantasyTeamRanking[] = [];
      let seasonCurrentRank = 1;
      let seasonLastPoints: number | null = null;

      for (let i = 0; i < seasonRows.length; i++) {
        const { teamId, totalPoints } = seasonRows[i];
        const numericPoints = Number(totalPoints) || 0;

        if (seasonLastPoints !== null && numericPoints < seasonLastPoints) {
          seasonCurrentRank = i + 1;
        }
        seasonLastPoints = numericPoints;

        seasonRankings.push(
          this.rankingRepo.create({
            teamId,
            fixtureId: 0,
            totalPoints: numericPoints,
            rank: seasonCurrentRank,
            team: teamById.get(teamId),
          }),
        );
      }

      await this.rankingRepo.save(seasonRankings);
    }
  }

  async getSeasonLeaderboard() {
    // Season rows are precomputed in computeForFixture with fixtureId = 0
    return this.rankingRepo.find({
      where: { fixtureId: 0 },
      relations: ['team', 'team.owner'],
      order: { rank: 'ASC' },
    });
  }

  async getGameweekLeaderboard(gameweekId: number) {
    return this.rankingRepo.find({
      where: { gameweekId },
      relations: ['team', 'team.owner'],
      order: { rank: 'ASC' },
    });
  }

  private calculateBasePoints(
    position: PositionCode,
    s: PlayerMatchStats,
  ): number {
    const c = this.fantasyConfig.scoring;
    let points = 0;

    if (s.minutesPlayed > 0) points += c.playedMatch;
    points += s.goals * c.goal;
    points += s.assists * c.assist;

    const isDefOrGk = position === 'DEF' || position === 'GK';
    if (isDefOrGk && s.cleanSheet) points += c.cleanSheet;

    if (position === 'GK') {
      const saveBlocks = Math.floor(s.saves / 3);
      points += saveBlocks * c.threeSaves;
    }

    if (isDefOrGk && s.goalsConceded > 0) {
      const steps = Math.floor(s.goalsConceded / c.goalsConcededStep.step);
      points += steps * c.goalsConcededStep.points;
    }

    points += s.yellowCards * c.yellowCard;
    points += s.redCards * c.redCard;
    points += s.ownGoals * c.ownGoal;

    if (s.penaltyMissed) points += c.penaltyMiss;

    return points;
  }

  private calculateBonusPoints(s: PlayerMatchStats): number {
    const c = this.fantasyConfig.scoring;
    if (s.rating == null) return 0;

    if (s.rating >= c.ratingHigh.min && s.rating <= c.ratingHigh.max) {
      return c.ratingHigh.points;
    }
    if (s.rating >= c.ratingMedium.min && s.rating <= c.ratingMedium.max) {
      return c.ratingMedium.points;
    }
    return 0;
  }

  private calculateRolePoints(
    sp: FantasySquadPlayer,
    s: PlayerMatchStats,
  ): number {
    const c = this.fantasyConfig.scoring;
    let points = 0;

    if (sp.isPenaltyTaker && s.penaltyScored) {
      points += c.penaltyScoredCorrectTaker;
    }
    if (sp.isFreeKickTaker && s.freeKickScored) {
      points += c.freeKickScoredCorrectTaker;
    }

    return points;
  }
}

import { Inject, Injectable, Logger } from '@nestjs/common';
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
import { FantasyTimeService } from './fantasy-time.service';
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
import { InjectDataSource } from '@nestjs/typeorm';
import { DataSource } from 'typeorm';
import { Player } from '@/modules/players/entities/player.entity';
import { PlayerFixtureStats } from '@/modules/players/entities/player-fixture-stats.entity';

@Injectable()
export class FantasyScoringService {
  private fantasyConfig: FantasyConfig;
  private readonly logger = new Logger(FantasyScoringService.name);

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
    @InjectDataSource() private readonly db: DataSource,
    private readonly fantasyTimeService: FantasyTimeService,
  ) {
    this.fantasyConfig = this.configService.get('fantasy', { infer: true })!;
  }

  private getNow(): Date {
    return this.fantasyTimeService.getNow();
  }

  /**
   * Recompute scoring for all locally-synced fixtures from the beginning of time
   * up to (and including) the current "now" (supports nowOverrideIso).
   *
   * Idempotent: computeForFixture clears and re-inserts points/rankings per fixture.
   */
  async computeUpToNow(options?: { until?: Date; concurrency?: number }) {
    const until = options?.until ?? this.getNow();
    const concurrency = Math.max(1, Math.min(options?.concurrency ?? 1, 5));

    const fixtureRows = await this.fixtureRepo
      .createQueryBuilder('f')
      .select(['f.id', 'f.startingAt'])
      .where('f.startingAt <= :until', { until })
      .orderBy('f.startingAt', 'ASC')
      .getMany();

    const fixtureIds = fixtureRows.map((f) => f.id);

    let processed = 0;
    let scored = 0;
    let skippedNoStats = 0;
    let errors = 0;
    const scoredFixtureIds: number[] = [];

    const runOne = async (fixtureId: number) => {
      processed++;
      try {
        const result = await this.computeForFixture(fixtureId);
        if (result === 'no_stats') skippedNoStats++;
        else {
          scored++;
          scoredFixtureIds.push(fixtureId);
        }
      } catch (e) {
        errors++;
        this.logger.warn(
          `computeForFixture failed for fixture ${fixtureId}: ${
            (e as Error)?.message ?? e
          }`,
        );
      }
    };

    // Simple concurrency-limited runner
    let idx = 0;
    const workers = Array.from({ length: concurrency }).map(async () => {
      while (idx < fixtureIds.length) {
        const myIdx = idx++;
        const fixtureId = fixtureIds[myIdx];
        await runOne(fixtureId);
      }
    });
    await Promise.all(workers);

    return {
      until,
      totalFixtures: fixtureIds.length,
      processed,
      scored,
      skippedNoStats,
      errors,
      concurrency,
      scoredFixtureIds,
    };
  }

  async computeForFixture(fixtureId: number): Promise<'scored' | 'no_stats'> {
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
    if (!stats.length) return 'no_stats';

    // Keep global player stats up-to-date (idempotent via per-fixture upsert)
    await this.upsertPlayerFixtureStatsAndUpdatePlayerTotals(fixtureId, stats);

    const statsByPlayerId = new Map<number, PlayerMatchStats>();
    const playerIds: number[] = [];
    for (const s of stats) {
      statsByPlayerId.set(s.playerId, s);
      playerIds.push(s.playerId);
    }

    // No relevant fantasy players → nothing to score
    if (!playerIds.length) {
      console.warn(`No relevant fantasy players for fixture ${fixtureId}`);
      return 'no_stats';
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
    const boostsByTeamId = new Map<string, Set<FantasyBoostType>>();
    if (gameweek && squads.length) {
      const teamIds = squads.map((s) => s.teamId);
      const boosts = await this.boostRepo.find({
        where: { gameweekId: gameweek.id, teamId: In(teamIds) as any },
      });
      for (const b of boosts) {
        const set = boostsByTeamId.get(b.teamId) ?? new Set<FantasyBoostType>();
        set.add(b.type);
        boostsByTeamId.set(b.teamId, set);
      }
    }

    const pointsToSave: FantasyPoints[] = [];
    const totalsByTeamId = new Map<string, number>();
    const statsByTeamId = new Map<
      string,
      {
        goals: number;
        assists: number;
        saves: number;
        yellowCards: number;
        redCards: number;
        ownGoals: number;
        cleanSheets: number; // 0/1 for fixture rows
      }
    >();

    for (const squad of squads) {
      const teamId = squad.teamId;
      if (!statsByTeamId.has(teamId)) {
        statsByTeamId.set(teamId, {
          goals: 0,
          assists: 0,
          saves: 0,
          yellowCards: 0,
          redCards: 0,
          ownGoals: 0,
          cleanSheets: 0,
        });
      }
      const boostTypes = gameweek ? boostsByTeamId.get(teamId) : undefined;
      const hasMaxCaptain =
        boostTypes?.has(FantasyBoostType.MAX_CAPTAIN) ?? false;
      const hasTripleCaptain =
        boostTypes?.has(FantasyBoostType.TRIPLE_CAPTAIN) ?? false;
      const hasSavesBoost =
        boostTypes?.has(FantasyBoostType.SAVES_BOOST) ?? false;
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

        const agg = statsByTeamId.get(teamId)!;
        agg.goals += stat.goals || 0;
        agg.assists += stat.assists || 0;
        agg.saves += stat.saves || 0;
        agg.yellowCards += stat.yellowCards || 0;
        agg.redCards += stat.redCards || 0;
        agg.ownGoals += stat.ownGoals || 0;
        if (stat.cleanSheet) {
          // cleanSheet is only true for GK/DEF in our provider; mark fixture clean sheet once
          agg.cleanSheets = 1;
        }

        const basePoints = this.calculateBasePoints(sp.position, stat);
        const bonusPoints = this.calculateBonusPoints(stat);
        const rolePoints = this.calculateRolePoints(sp, stat);

        let total = basePoints + bonusPoints + rolePoints;

        // Apply captain-related boosts
        const captainMultiplier = hasTripleCaptain ? 3 : 2;
        if (hasMaxCaptain) {
          const isCaptain = captainSp && sp.id === captainSp.id;
          const isVice = viceCaptainSp && sp.id === viceCaptainSp.id;
          if ((isCaptain || isVice) && stat.minutesPlayed > 0) {
            total *= captainMultiplier;
          }
        } else {
          if (effectiveCaptainId && sp.id === effectiveCaptainId) {
            total *= captainMultiplier;
          }
        }

        // Apply saves boost (3 points per save for goalkeeper)
        if (hasSavesBoost && sp.position === 'GK' && stat.saves > 0) {
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
      const agg = statsByTeamId.get(teamId) ?? {
        goals: 0,
        assists: 0,
        saves: 0,
        yellowCards: 0,
        redCards: 0,
        ownGoals: 0,
        cleanSheets: 0,
      };

      if (lastPoints !== null && totalPoints < lastPoints) {
        currentRank = i + 1;
      }
      lastPoints = totalPoints;

      rankings.push(
        this.rankingRepo.create({
          teamId,
          fixtureId,
          gameweekId: gameweek?.id ?? null,
          totalPoints,
          goals: agg.goals,
          assists: agg.assists,
          saves: agg.saves,
          yellowCards: agg.yellowCards,
          redCards: agg.redCards,
          ownGoals: agg.ownGoals,
          cleanSheets: agg.cleanSheets,
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
        .addSelect('SUM(p.goals)', 'goals')
        .addSelect('SUM(p.assists)', 'assists')
        .addSelect('SUM(p.saves)', 'saves')
        .addSelect('SUM(p.yellowCards)', 'yellowCards')
        .addSelect('SUM(p.redCards)', 'redCards')
        .addSelect('SUM(p.ownGoals)', 'ownGoals')
        .where('p.gameweekId = :gwId', { gwId: gameweek.id })
        .groupBy('p.teamId')
        // Avoid ordering by a mixed-case alias in Postgres (would be folded to lowercase and fail).
        .orderBy('SUM(p.totalPoints)', 'DESC')
        .getRawMany<{
          teamId: string;
          totalPoints: string;
          goals: string;
          assists: string;
          saves: string;
          yellowCards: string;
          redCards: string;
          ownGoals: string;
        }>();

      const gwCleanSheetsRaw = await this.rankingRepo
        .createQueryBuilder('r')
        .select('r.teamId', 'teamId')
        .addSelect('SUM(r.cleanSheets)', 'cleanSheets')
        .where('r.gameweekId = :gwId', { gwId: gameweek.id })
        .andWhere('r.fixtureId > 0')
        .groupBy('r.teamId')
        .getRawMany<{ teamId: string; cleanSheets: string }>();
      const gwCleanSheetsByTeamId = new Map<string, number>(
        gwCleanSheetsRaw.map((r) => [r.teamId, Number(r.cleanSheets) || 0]),
      );

      // Clear existing *gameweek aggregate* rankings for this gameweek.
      // IMPORTANT: fixture rankings also have gameweekId set, so we must not delete by gameweekId alone.
      await this.rankingRepo.delete({ gameweekId: gameweek.id, fixtureId: -1 });

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
          const {
            teamId,
            totalPoints,
            goals,
            assists,
            saves,
            yellowCards,
            redCards,
            ownGoals,
          } = gwRows[i];
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
              goals: Number(goals) || 0,
              assists: Number(assists) || 0,
              saves: Number(saves) || 0,
              yellowCards: Number(yellowCards) || 0,
              redCards: Number(redCards) || 0,
              ownGoals: Number(ownGoals) || 0,
              cleanSheets: gwCleanSheetsByTeamId.get(teamId) ?? 0,
              rank: gwCurrentRank,
              team: gwTeamById.get(teamId),
            }),
          );
        }

        await this.rankingRepo.save(gwRankings);
      }
    }

    // Rebuild season rankings (fixtureId = 0) from all per-fixture rankings (exclude gameweek aggregates)
    const seasonRows = await this.rankingRepo
      .createQueryBuilder('r')
      .select('r.teamId', 'teamId')
      .addSelect('SUM(r.totalPoints)', 'totalPoints')
      .addSelect('SUM(r.goals)', 'goals')
      .addSelect('SUM(r.assists)', 'assists')
      .addSelect('SUM(r.saves)', 'saves')
      .addSelect('SUM(r.yellowCards)', 'yellowCards')
      .addSelect('SUM(r.redCards)', 'redCards')
      .addSelect('SUM(r.ownGoals)', 'ownGoals')
      .addSelect('SUM(r.cleanSheets)', 'cleanSheets')
      .where('r.fixtureId > 0')
      .groupBy('r.teamId')
      // Avoid ordering by a mixed-case alias in Postgres (would be folded to lowercase and fail).
      .orderBy('SUM(r.totalPoints)', 'DESC')
      .getRawMany<{
        teamId: string;
        totalPoints: string;
        goals: string;
        assists: string;
        saves: string;
        yellowCards: string;
        redCards: string;
        ownGoals: string;
        cleanSheets: string;
      }>();

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
        const {
          teamId,
          totalPoints,
          goals,
          assists,
          saves,
          yellowCards,
          redCards,
          ownGoals,
          cleanSheets,
        } = seasonRows[i];
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
            goals: Number(goals) || 0,
            assists: Number(assists) || 0,
            saves: Number(saves) || 0,
            yellowCards: Number(yellowCards) || 0,
            redCards: Number(redCards) || 0,
            ownGoals: Number(ownGoals) || 0,
            cleanSheets: Number(cleanSheets) || 0,
            rank: seasonCurrentRank,
            team: teamById.get(teamId),
          }),
        );
      }

      await this.rankingRepo.save(seasonRankings);
    }

    return 'scored';
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

  private toFantasyPositionCode(p: Player): PositionCode {
    const code = (p.position?.code || '').trim().toUpperCase();
    if (code === 'G') return 'GK';
    if (code === 'D') return 'DEF';
    if (code === 'M') return 'MID';
    if (code === 'F') return 'FWD';

    const dev = (p.position?.developer_name || '').trim().toUpperCase();
    if (dev.includes('GOALKEEPER')) return 'GK';
    if (dev.includes('DEFENDER')) return 'DEF';
    if (dev.includes('MIDFIELDER')) return 'MID';
    if (dev.includes('FORWARD') || dev.includes('ATTACKER')) return 'FWD';

    // Safe default
    return 'MID';
  }

  /**
   * Upsert per-player-per-fixture stats, then aggregate into Player row.
   * This makes re-scoring a fixture idempotent for player stats.
   */
  private async upsertPlayerFixtureStatsAndUpdatePlayerTotals(
    fixtureId: number,
    stats: PlayerMatchStats[],
  ) {
    const playerIds = Array.from(new Set(stats.map((s) => s.playerId)));
    if (!playerIds.length) return;

    const playerRepo = this.db.getRepository(Player);
    const pfsRepo = this.db.getRepository(PlayerFixtureStats);

    const players = await playerRepo.find({
      where: { id: In(playerIds) as any },
      select: ['id', 'position'],
    });
    const playerById = new Map(players.map((p) => [p.id, p]));

    const rows = stats.map((s) => {
      const p = playerById.get(s.playerId);
      const pos = p ? this.toFantasyPositionCode(p) : ('MID' as PositionCode);
      const basePoints = this.calculateBasePoints(pos, s);
      const bonusPoints = this.calculateBonusPoints(s);

      return pfsRepo.create({
        playerId: s.playerId,
        fixtureId,
        minutesPlayed: s.minutesPlayed || 0,
        goals: s.goals || 0,
        assists: s.assists || 0,
        yellowCards: s.yellowCards || 0,
        redCards: s.redCards || 0,
        fantasyPoints: basePoints + bonusPoints,
        cleanSheet: s.cleanSheet ?? false,
      });
    });

    // Idempotent per fixture
    await pfsRepo.upsert(rows, ['playerId', 'fixtureId']);

    // Aggregate totals for affected players only
    const agg = await pfsRepo
      .createQueryBuilder('pfs')
      .select('pfs.playerId', 'playerId')
      .addSelect('COALESCE(SUM(pfs.goals), 0)', 'goals')
      .addSelect('COALESCE(SUM(pfs.assists), 0)', 'assists')
      .addSelect('COALESCE(SUM(pfs.yellowCards), 0)', 'yellowCards')
      .addSelect('COALESCE(SUM(pfs.redCards), 0)', 'redCards')
      .addSelect('COALESCE(SUM(pfs.fantasyPoints), 0)', 'points')
      .addSelect(
        'COALESCE(SUM(CASE WHEN pfs."cleanSheet" THEN 1 ELSE 0 END), 0)',
        'cleanSheets',
      )
      .where('pfs.playerId IN (:...playerIds)', { playerIds })
      .groupBy('pfs.playerId')
      .getRawMany<{
        playerId: string;
        goals: string;
        assists: string;
        yellowCards: string;
        redCards: string;
        points: string;
        cleanSheets: string;
      }>();

    for (const row of agg) {
      await playerRepo.update(Number(row.playerId), {
        goals: Number(row.goals) || 0,
        assists: Number(row.assists) || 0,
        yellowCards: Number(row.yellowCards) || 0,
        redCards: Number(row.redCards) || 0,
        points: Number(row.points) || 0,
        cleanSheets: Number(row.cleanSheets) || 0,
      });
    }
  }
}

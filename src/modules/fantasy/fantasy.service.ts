import {
  BadRequestException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { In, LessThan, LessThanOrEqual, MoreThan, Repository } from 'typeorm';
import { FantasyTeam } from './entities/fantasy-team.entity';
import { FantasySquad } from './entities/fantasy-squad.entity';
import { FantasySquadPlayer } from './entities/fantasy-squad-player.entity';
import { FantasyTransfer } from './entities/fantasy-transfer.entity';
import { FantasyTeamEvent } from './entities/fantasy-team-event.entity';
import { FantasyTeamRanking } from './entities/fantasy-team-ranking.entity';
import { FantasyPoints } from './entities/fantasy-points.entity';
import { User } from '@/modules/users/entities/user.entity';
import { Player } from '@/modules/players/entities/player.entity';
import { PlayersService } from '@/modules/players/players.service';
import { ConfigService } from '@nestjs/config';
import { MainConfig } from '@/common/config/main.config';
import { FantasyConfig } from '@/common/config/fantasy.config';
import { FantasyTimeService } from './fantasy-time.service';
import { mapPlayerToPositionCode, parseFormation } from './fantasy.utils';
import {
  FANTASY_BOOST_LABELS,
  FantasyBoostType,
  FantasyEventType,
  FantasyGameweekPhase,
  TransferType,
} from './fantasy.types';
import {
  CreateFantasyTeamDto,
  CreateFantasySquadDto,
  ApplyBoostDto,
  UpdateLineupDto,
  UpdateRolesDto,
  TransferRequestDto,
} from './dto';
import { SportmonksFixturesService } from '@/common/sportmonks/services/fixtures.service';
import { FantasyGameweek } from './entities/fantasy-gameweek.entity';
import { FantasyBoost } from './entities/fantasy-boost.entity';
import { Fixture } from '@/modules/stages/entities/fixture.entity';
import { FootballTeam } from '@/modules/team/entities/football-team.entity';
import { PlayerFixtureStats } from '@/modules/players/entities/player-fixture-stats.entity';
import {
  GlobalInsightsResponseDto,
  InsightMetricUnit,
  InsightWidgetCardDto,
  InsightWidgetItemDto,
  InsightWidgetPlayerDto,
} from './dto';

@Injectable()
export class FantasyService {
  private fantasyConfig: FantasyConfig;

  constructor(
    private readonly playersService: PlayersService,
    private readonly configService: ConfigService<MainConfig>,
    private readonly fixturesService: SportmonksFixturesService,
    @InjectRepository(FantasyTeam)
    private readonly teamRepo: Repository<FantasyTeam>,
    @InjectRepository(FantasySquad)
    private readonly squadRepo: Repository<FantasySquad>,
    @InjectRepository(FantasySquadPlayer)
    private readonly squadPlayerRepo: Repository<FantasySquadPlayer>,
    @InjectRepository(FantasyTransfer)
    private readonly transferRepo: Repository<FantasyTransfer>,
    @InjectRepository(FantasyTeamEvent)
    private readonly eventRepo: Repository<FantasyTeamEvent>,
    @InjectRepository(FantasyTeamRanking)
    private readonly rankingRepo: Repository<FantasyTeamRanking>,
    @InjectRepository(FantasyGameweek)
    private readonly gameweekRepo: Repository<FantasyGameweek>,
    @InjectRepository(FantasyBoost)
    private readonly boostRepo: Repository<FantasyBoost>,
    @InjectRepository(FantasyPoints)
    private readonly pointsRepo: Repository<FantasyPoints>,
    @InjectRepository(Fixture)
    private readonly fixtureRepo: Repository<Fixture>,
    @InjectRepository(FootballTeam)
    private readonly footballTeamRepo: Repository<FootballTeam>,
    @InjectRepository(Player)
    private readonly playerRepo: Repository<Player>,
    @InjectRepository(PlayerFixtureStats)
    private readonly playerFixtureStatsRepo: Repository<PlayerFixtureStats>,
    private readonly fantasyTimeService: FantasyTimeService,
  ) {
    this.fantasyConfig = this.configService.get('fantasy', { infer: true })!;
  }

  private getNow(): Date {
    return this.fantasyTimeService.getNow();
  }

  private ensureOwnership(team: FantasyTeam, user: User) {
    if (team.ownerId !== user.id) {
      throw new ForbiddenException('You do not own this fantasy team');
    }
  }

  /**
   * Enforces the "max N players from the same team" rule. In this World Cup
   * context a player's "team" is their national team, identified by countryId.
   * Throws BadRequestException listing the offending team(s) when exceeded.
   */
  private ensureMaxPlayersPerTeam(players: Player[]) {
    const max = this.fantasyConfig.maxPlayersPerTeam;
    if (!max || max <= 0) return;

    const countByTeam = new Map<number, number>();
    for (const player of players) {
      const teamId = player.countryId;
      if (!teamId) continue;
      countByTeam.set(teamId, (countByTeam.get(teamId) ?? 0) + 1);
    }

    const offending = [...countByTeam.values()].some((count) => count > max);
    if (offending) {
      throw new BadRequestException(
        `You can select a maximum of ${max} players from the same team`,
      );
    }
  }

  private toInsightWidgetPlayerDto(player: Player): InsightWidgetPlayerDto {
    return {
      id: player.id,
      name: player.name,
      commonName: player.commonName,
      image: player.image,
      pool: player.pool,
      positionCode: player.position?.code ?? '',
      points: player.points ?? 0,
    };
  }

  private buildInsightCard(params: {
    title: string;
    metricUnit: InsightMetricUnit;
    metricLabel: string;
    items: InsightWidgetItemDto[];
    gameweek?: FantasyGameweek | null;
  }): InsightWidgetCardDto {
    return {
      title: params.title,
      metricUnit: params.metricUnit,
      metricLabel: params.metricLabel,
      items: params.items,
      gameweekId: params.gameweek?.id ?? null,
      gameweekCode: params.gameweek?.code ?? null,
    };
  }

  private sortTopCounts(
    entries: Array<{ playerId: number; value: number }>,
    limit: number,
  ) {
    return entries
      .filter((e) => Number.isFinite(e.playerId) && Number.isFinite(e.value))
      .sort((a, b) =>
        b.value !== a.value ? b.value - a.value : a.playerId - b.playerId,
      )
      .slice(0, limit);
  }

  private roundPercent(numerator: number, denominator: number): number {
    if (!denominator) return 0;
    return Math.round((numerator / denominator) * 100);
  }

  private async getLatestLockedGameweek(): Promise<FantasyGameweek | null> {
    const now = this.getNow();
    const gws = await this.gameweekRepo.find({
      where: { snapshotDeadlineAt: LessThanOrEqual(now) },
      order: { snapshotDeadlineAt: 'DESC' },
      take: 1,
    });
    return gws[0] ?? null;
  }

  private async getPreviousGameweek(
    gameweek: FantasyGameweek,
  ): Promise<FantasyGameweek | null> {
    const gws = await this.gameweekRepo.find({
      where: { snapshotDeadlineAt: LessThan(gameweek.snapshotDeadlineAt) },
      order: { snapshotDeadlineAt: 'DESC' },
      take: 1,
    });
    return gws[0] ?? null;
  }

  private async getLockedSquadIdsForInsights(
    gameweek: FantasyGameweek | null,
  ): Promise<string[]> {
    if (gameweek) {
      const squads = await this.squadRepo.find({
        where: {
          isLocked: true,
          gameweekId: gameweek.id,
        },
        select: ['id'],
      });
      if (squads.length) return squads.map((s) => s.id);
    }

    // Fallback: use the most recent locked squad per team (best-effort).
    const allLocked = await this.squadRepo.find({
      where: { isLocked: true },
      order: { teamId: 'ASC', lockedAt: 'DESC', createdAt: 'DESC' },
      select: ['id', 'teamId', 'lockedAt', 'createdAt'],
    });

    const picked: string[] = [];
    const seenTeams = new Set<string>();
    for (const s of allLocked) {
      if (!s.teamId || seenTeams.has(s.teamId)) continue;
      seenTeams.add(s.teamId);
      picked.push(s.id);
    }

    return picked;
  }

  async getGlobalInsights(): Promise<GlobalInsightsResponseDto> {
    const latestLockedGw = await this.getLatestLockedGameweek();
    const prevLockedGw = latestLockedGw
      ? await this.getPreviousGameweek(latestLockedGw)
      : null;

    const squadIds = await this.getLockedSquadIdsForInsights(latestLockedGw);
    const totalSquads = squadIds.length;

    const squadPlayers = totalSquads
      ? await this.squadPlayerRepo.find({
          where: { squadId: In(squadIds) },
          select: ['playerId', 'isCaptain', 'squadId'],
        })
      : [];

    const selectedCounts = new Map<number, number>();
    const captainCounts = new Map<number, number>();

    for (const sp of squadPlayers) {
      selectedCounts.set(sp.playerId, (selectedCounts.get(sp.playerId) ?? 0) + 1);
      if (sp.isCaptain) {
        captainCounts.set(
          sp.playerId,
          (captainCounts.get(sp.playerId) ?? 0) + 1,
        );
      }
    }

    const topSelected = this.sortTopCounts(
      [...selectedCounts.entries()].map(([playerId, value]) => ({
        playerId,
        value,
      })),
      5,
    );

    const topCaptained = this.sortTopCounts(
      [...captainCounts.entries()].map(([playerId, value]) => ({
        playerId,
        value,
      })),
      5,
    );

    const transfersStart = prevLockedGw?.snapshotDeadlineAt ?? new Date(0);
    const transfersEnd = latestLockedGw?.snapshotDeadlineAt ?? this.getNow();

    const transferRaw = await this.transferRepo
      .createQueryBuilder('t')
      .select('t.playerInId', 'playerId')
      .addSelect('COUNT(t.id)', 'value')
      .where('t.createdAt > :start', { start: transfersStart })
      .andWhere('t.createdAt <= :end', { end: transfersEnd })
      .groupBy('t.playerInId')
      .orderBy('value', 'DESC')
      .addOrderBy('t.playerInId', 'ASC')
      .limit(5)
      .getRawMany<{ playerId: string; value: string }>();

    const topTransferred = transferRaw.map((r) => ({
      playerId: parseInt(r.playerId, 10),
      value: parseInt(r.value, 10) || 0,
    }));

    const performerRaw = latestLockedGw
      ? await this.playerFixtureStatsRepo
          .createQueryBuilder('pfs')
          .innerJoin(Fixture, 'f', 'f.id = pfs.fixtureId')
          .select('pfs.playerId', 'playerId')
          .addSelect('SUM(pfs.fantasyPoints)', 'value')
          .where('f.gameweekId = :gameweekId', { gameweekId: latestLockedGw.id })
          .groupBy('pfs.playerId')
          .orderBy('value', 'DESC')
          .addOrderBy('pfs.playerId', 'ASC')
          .limit(5)
          .getRawMany<{ playerId: string; value: string }>()
      : [];

    const topPerforming = performerRaw.length
      ? performerRaw.map((r) => ({
          playerId: parseInt(r.playerId, 10),
          value: parseInt(r.value, 10) || 0,
        }))
      : (
          await this.playerRepo.find({
            order: { points: 'DESC', id: 'ASC' },
            take: 5,
          })
        ).map((p) => ({ playerId: p.id, value: p.points ?? 0 }));

    const allPlayerIds = [
      ...new Set([
        ...topSelected.map((x) => x.playerId),
        ...topCaptained.map((x) => x.playerId),
        ...topTransferred.map((x) => x.playerId),
        ...topPerforming.map((x) => x.playerId),
      ]),
    ].filter((id) => Number.isFinite(id));

    const players = allPlayerIds.length
      ? await this.playerRepo.findBy({ id: In(allPlayerIds) })
      : [];

    const playerById = new Map<number, Player>(players.map((p) => [p.id, p]));

    const toItems = (
      list: Array<{ playerId: number; value: number }>,
      transform: (value: number) => number,
    ): InsightWidgetItemDto[] =>
      list
        .map(({ playerId, value }) => {
          const player = playerById.get(playerId);
          if (!player) return null;
          return {
            player: this.toInsightWidgetPlayerDto(player),
            metricValue: transform(value),
          };
        })
        .filter((x): x is InsightWidgetItemDto => !!x);

    return {
      mostSelected: this.buildInsightCard({
        title: 'Most Selected Player',
        metricUnit: InsightMetricUnit.PERCENT,
        metricLabel: 'Ownership',
        items: toItems(topSelected, (count) =>
          this.roundPercent(count, totalSquads),
        ),
        gameweek: latestLockedGw,
      }),
      mostCaptained: this.buildInsightCard({
        title: 'Most Captained',
        metricUnit: InsightMetricUnit.PERCENT,
        metricLabel: 'Captained',
        items: toItems(topCaptained, (count) =>
          this.roundPercent(count, totalSquads),
        ),
        gameweek: latestLockedGw,
      }),
      mostTransferred: this.buildInsightCard({
        title: 'Most Transferred In',
        metricUnit: InsightMetricUnit.COUNT,
        metricLabel: 'Transfers',
        items: toItems(topTransferred, (count) => count),
        gameweek: latestLockedGw,
      }),
      bestPerforming: this.buildInsightCard({
        title: latestLockedGw
          ? `Top Performer (Gameweek ${latestLockedGw.code})`
          : 'Top Performer',
        metricUnit: InsightMetricUnit.POINTS,
        metricLabel: 'Points',
        items: toItems(topPerforming, (points) => points),
        gameweek: latestLockedGw,
      }),
    };
  }

  /**
   * Returns the next gameweek whose snapshot deadline is still in the future.
   * This is the gameweek the user is currently "editing towards".
   */
  private async getNextOpenGameweek(): Promise<FantasyGameweek | null> {
    const now = this.getNow();
    const gw = await this.gameweekRepo
      .createQueryBuilder('gw')
      .where('gw.snapshotDeadlineAt > :now', { now })
      .orderBy('gw.snapshotDeadlineAt', 'ASC')
      .getOne();

    if (!gw) {
      return null;
    }

    return gw;
  }

  private ensureGameweekIsEditable(gameweek: FantasyGameweek) {
    const now = this.getNow();
    if (now >= gameweek.snapshotDeadlineAt) {
      throw new BadRequestException(
        'Changes are not allowed after the gameweek snapshot deadline',
      );
    }
  }

  private async getGameweekFirstFixtureId(gameweekId: number) {
    const first = await this.fixtureRepo.findOne({
      where: { gameweekId },
      order: { startingAt: 'ASC' },
      select: ['id'],
    });
    return first?.id ?? null;
  }

  private async lockExpiredDraftSquads(teamId: string) {
    const now = this.getNow();
    const drafts = await this.squadRepo.find({
      where: { teamId, isLocked: false },
      relations: ['gameweek'],
    });

    const toLock = drafts.filter(
      (s) =>
        !s.isLocked &&
        !!s.gameweekId &&
        !!s.gameweek?.snapshotDeadlineAt &&
        now >= s.gameweek.snapshotDeadlineAt,
    );

    for (const s of toLock) {
      s.isLocked = true;
      s.isCurrent = false;
      s.lockedAt = s.gameweek!.snapshotDeadlineAt;
      await this.squadRepo.save(s);
    }
  }

  private async getOrCreateDraftSquadForGameweek(
    team: FantasyTeam,
    gameweek: FantasyGameweek,
  ) {
    await this.lockExpiredDraftSquads(team.id);

    // Prefer an existing draft for this gameweek
    const existing = await this.squadRepo.findOne({
      where: { teamId: team.id, gameweekId: gameweek.id, isLocked: false },
      relations: ['players', 'players.player'],
    });
    if (existing) {
      if (!existing.isCurrent) {
        await this.squadRepo.update(
          { teamId: team.id, isCurrent: true },
          { isCurrent: false },
        );
        existing.isCurrent = true;
        await this.squadRepo.save(existing);
      }
      return existing;
    }

    // Legacy fallback: first-ever squad may have no gameweekId yet
    const legacy = await this.squadRepo.findOne({
      where: { teamId: team.id, isCurrent: true, gameweekId: null as any },
      relations: ['players', 'players.player'],
    });
    if (legacy && !legacy.isLocked) {
      legacy.gameweekId = gameweek.id;
      legacy.isCurrent = true;
      legacy.isLocked = false;
      await this.squadRepo.save(legacy);
      return legacy;
    }

    // Otherwise create a new draft by copying the latest known squad snapshot
    const base = await this.squadRepo.findOne({
      where: { teamId: team.id },
      order: { createdAt: 'DESC' },
      relations: ['players', 'players.player'],
    });
    if (!base) {
      throw new BadRequestException('You must create a squad first');
    }

    await this.squadRepo.update(
      { teamId: team.id, isCurrent: true },
      { isCurrent: false },
    );

    const draft = await this.squadRepo.save(
      this.squadRepo.create({
        team,
        teamId: team.id,
        formation: base.formation,
        gameweekId: gameweek.id,
        isLocked: false,
        lockedAt: null,
        isCurrent: true,
      }),
    );

    const players = base.players.map((sp) =>
      this.squadPlayerRepo.create({
        squad: draft,
        squadId: draft.id,
        player: sp.player,
        playerId: sp.playerId,
        position: sp.position,
        isStarting: sp.isStarting,
        isCaptain: sp.isCaptain,
        isViceCaptain: sp.isViceCaptain,
        isPenaltyTaker: sp.isPenaltyTaker,
        isFreeKickTaker: sp.isFreeKickTaker,
      }),
    );
    await this.squadPlayerRepo.save(players);

    draft.players = players;
    return draft;
  }

  async getMyTeam(user: User) {
    const team = await this.teamRepo.findOne({
      where: { ownerId: user.id },
      relations: ['squads', 'squads.players', 'squads.players.player'],
    });
    if (!team) throw new NotFoundException('Fantasy team not found');

    const season = await this.buildSeasonSummary(team.id);

    // If the team exists but the user hasn't created an initial squad yet,
    // return the team and let the client prompt squad creation.
    if (!team.squads?.length) {
      return { team, season, currentSquad: null };
    }

    const gameweek = await this.getNextOpenGameweek();
    if (gameweek) {
      const currentSquad = await this.getOrCreateDraftSquadForGameweek(
        team,
        gameweek,
      );
      return { team, season, currentSquad };
    }

    // Season is over / no upcoming gameweek. Return the most recent "current" squad
    // (and make sure any expired drafts are locked).
    await this.lockExpiredDraftSquads(team.id);

    const currentSquad =
      (await this.squadRepo.findOne({
        where: { teamId: team.id, isCurrent: true },
        relations: ['players', 'players.player', 'gameweek'],
        order: { createdAt: 'DESC' },
      })) ??
      (await this.squadRepo.findOne({
        where: { teamId: team.id },
        relations: ['players', 'players.player', 'gameweek'],
        order: { createdAt: 'DESC' },
      }));

    return { team, season, currentSquad: currentSquad ?? null };
  }

  async getPublicTeam(teamId: string) {
    const team = await this.teamRepo.findOne({
      where: { id: teamId },
      relations: ['owner'],
    });
    if (!team) throw new NotFoundException('Fantasy team not found');

    const season = await this.buildSeasonSummary(team.id);
    await this.lockExpiredDraftSquads(team.id);

    const currentSquad = await this.squadRepo.findOne({
      where: { teamId: team.id, isLocked: true },
      relations: [
        'players',
        'players.player',
        'players.player.position',
        'players.player.country',
        'gameweek',
      ],
      order: { lockedAt: 'DESC', createdAt: 'DESC' },
    });

    return {
      team: {
        id: team.id,
        name: team.name,
        logoUrl: team.logoUrl,
        budgetRemaining: Number(team.budgetRemaining),
        createdAt: team.createdAt,
        owner: {
          id: team.owner.id,
          fullName: team.owner.fullName,
          profileImageUrl: team.owner.profileImageUrl ?? '',
        },
      },
      season,
      currentSquad: currentSquad ?? null,
    };
  }

  private async buildSeasonSummary(teamId: string) {
    const seasonRow = await this.rankingRepo.findOne({
      where: { fixtureId: 0, teamId },
    });
    const seasonTotalPoints = seasonRow?.totalPoints ?? 0;
    const betterCount = await this.teamRepo
      .createQueryBuilder('t')
      .leftJoin(FantasyTeamRanking, 'r', 'r.teamId = t.id AND r.fixtureId = 0')
      .where('COALESCE(r.totalPoints, 0) > :p', { p: seasonTotalPoints })
      .getCount();

    return {
      rank: betterCount + 1,
      totalPoints: seasonTotalPoints,
      goals: seasonRow?.goals ?? 0,
      assists: seasonRow?.assists ?? 0,
      saves: seasonRow?.saves ?? 0,
      yellowCards: seasonRow?.yellowCards ?? 0,
      redCards: seasonRow?.redCards ?? 0,
      ownGoals: seasonRow?.ownGoals ?? 0,
      cleanSheets: seasonRow?.cleanSheets ?? 0,
    };
  }

  async createTeam(user: User, dto: CreateFantasyTeamDto) {
    const existing = await this.teamRepo.findOne({
      where: { ownerId: user.id },
    });
    if (existing) {
      throw new BadRequestException('You already have a fantasy team');
    }

    const initialBudget = this.fantasyConfig.initialBudget;

    const team = this.teamRepo.create({
      owner: user,
      ownerId: user.id,
      name: dto.name,
      logoUrl: dto.logoUrl || '',
      budgetTotal: initialBudget,
      budgetRemaining: initialBudget,
    });

    await this.teamRepo.save(team);

    return {
      message: `Your fantasy team ${dto.name} has been created`,
      teamId: team.id,
    };
  }

  async createSquad(user: User, dto: CreateFantasySquadDto) {
    const team = await this.teamRepo.findOne({
      where: { ownerId: user.id },
      relations: ['squads'],
    });
    if (!team) {
      throw new BadRequestException('You must create a team first');
    }

    const formationDef = parseFormation(dto.formation);
    const playerIds = dto.squad.map((p) => p.playerId);
    if (playerIds.length !== this.fantasyConfig.squadSize) {
      throw new BadRequestException(
        `Squad must have exactly ${this.fantasyConfig.squadSize} players`,
      );
    }

    const players = await this.playersService.getPlayersFromIds(playerIds);
    if (players.length !== playerIds.length) {
      throw new BadRequestException('Some players do not exist');
    }

    // Ensure no duplicates
    const uniqueIds = new Set(playerIds);
    if (uniqueIds.size !== playerIds.length) {
      throw new BadRequestException(
        'You cannot have duplicate players in your team',
      );
    }

    this.ensureMaxPlayersPerTeam(players);

    const totalCost = players.reduce((sum, p) => sum + p.price, 0);
    const initialBudget = this.fantasyConfig.initialBudget;
    if (totalCost > initialBudget) {
      throw new BadRequestException('Insufficient budget for selected squad');
    }

    // Validate starting XI and positions
    const startingIds = dto.squad
      .filter((p) => p.isStarting)
      .map((p) => p.playerId);
    if (startingIds.length !== this.fantasyConfig.startingXiSize) {
      throw new BadRequestException('Starting XI must have exactly 11 players');
    }

    const positionCounts: Record<string, number> = {
      GK: 0,
      DEF: 0,
      MID: 0,
      FWD: 0,
    };
    for (const p of players) {
      const pos = mapPlayerToPositionCode(p);
      if (startingIds.includes(p.id)) {
        positionCounts[pos] = (positionCounts[pos] || 0) + 1;
      }
    }
    Object.entries(formationDef.positions).forEach(([pos, count]) => {
      if (positionCounts[pos] !== count) {
        throw new BadRequestException(
          `Formation ${formationDef.code} requires ${count} ${pos} in starting XI`,
        );
      }
    });

    const gameweek = await this.getNextOpenGameweek();
    if (!gameweek) {
      throw new BadRequestException('Season is over: no upcoming gameweek');
    }
    this.ensureGameweekIsEditable(gameweek);

    // Make the entire operation transactional to avoid partial writes:
    // - if any step fails, we don't leave an orphan squad behind
    // - if an orphan squad exists from a previous failed attempt, we clean it up
    await this.teamRepo.manager.transaction(async (em) => {
      const teamRepo = em.getRepository(FantasyTeam);
      const squadRepo = em.getRepository(FantasySquad);
      const squadPlayerRepo = em.getRepository(FantasySquadPlayer);
      const eventRepo = em.getRepository(FantasyTeamEvent);

      const existingSquads = await squadRepo.find({
        where: { teamId: team.id },
        relations: ['players'],
      });

      if (existingSquads.length) {
        const hasRealSquad = existingSquads.some(
          (s) => (s.players?.length ?? 0) > 0,
        );

        if (hasRealSquad) {
          throw new BadRequestException('You already have a fantasy squad');
        }

        // Self-heal: delete orphan squads (typically created by a previous failed request)
        await squadRepo.remove(existingSquads);
      }

      // Create the draft squad for the upcoming (open) gameweek
      const squad = await squadRepo.save(
        squadRepo.create({
          teamId: team.id,
          formation: dto.formation,
          gameweekId: gameweek.id,
          isLocked: false,
          lockedAt: null,
          isCurrent: true,
        }),
      );

      // Then create squad players with an explicit squadId
      const squadPlayers = dto.squad.map((item) => {
        const player = players.find((p) => p.id === item.playerId)!;
        const position = mapPlayerToPositionCode(player);
        return squadPlayerRepo.create({
          squadId: squad.id,
          playerId: player.id,
          position,
          isStarting: item.isStarting,
          isCaptain: item.isCaptain ?? false,
          isViceCaptain: item.isViceCaptain ?? false,
          isPenaltyTaker: item.isPenaltyTaker ?? false,
          isFreeKickTaker: item.isFreeKickTaker ?? false,
        });
      });

      await squadPlayerRepo.save(squadPlayers);

      await teamRepo.update(team.id, {
        budgetTotal: initialBudget,
        budgetRemaining: initialBudget - totalCost,
      });

      await eventRepo.save(
        eventRepo.create({
          teamId: team.id,
          type: FantasyEventType.TRANSFER,
          payload: {
            type: TransferType.INITIAL,
            playerIds,
            gameweekId: gameweek.id,
          },
          userId: user.id,
        }),
      );
    });

    return {
      message: 'Your fantasy squad has been created',
    };
  }

  async applyBoost(user: User, dto: ApplyBoostDto) {
    const team = await this.teamRepo.findOne({
      where: { ownerId: user.id },
    });
    if (!team) {
      throw new BadRequestException('You must create a team first');
    }

    const now = this.getNow();
    const gameweek = await this.gameweekRepo
      .createQueryBuilder('gw')
      .where('gw.snapshotDeadlineAt > :now', { now })
      .orderBy('gw.snapshotDeadlineAt', 'ASC')
      .getOne();

    if (!gameweek) {
      throw new BadRequestException(
        'No upcoming gameweek available for boosts',
      );
    }

    if (now >= gameweek.snapshotDeadlineAt) {
      throw new BadRequestException(
        'Cannot apply boost after snapshot deadline for this gameweek',
      );
    }

    const existingSameType = await this.boostRepo.findOne({
      where: { teamId: team.id, gameweekId: gameweek.id, type: dto.type },
    });
    if (existingSameType) {
      throw new BadRequestException(
        'You already have this boost applied for this gameweek',
      );
    }

    if (!Object.values(FantasyBoostType).includes(dto.type)) {
      throw new BadRequestException('Invalid boost type');
    }

    // Enforce one usage per phase per boost type
    const phaseGameweeks = await this.gameweekRepo.find({
      where: {
        externalSeasonId: gameweek.externalSeasonId,
        phase: gameweek.phase,
      },
      select: ['id'],
    });
    const gwIds = phaseGameweeks.map((gw) => gw.id);

    if (gwIds.length > 0) {
      const usedInPhase = await this.boostRepo.count({
        where: {
          teamId: team.id,
          type: dto.type,
          gameweekId: In(gwIds),
        },
      });

      if (usedInPhase > 0) {
        throw new BadRequestException(
          'You have already used this boost in this phase',
        );
      }
    }

    const boost = this.boostRepo.create({
      teamId: team.id,
      gameweekId: gameweek.id,
      type: dto.type,
    });

    await this.boostRepo.save(boost);

    return {
      message: 'Boost applied',
      type: dto.type,
      gameweekId: gameweek.id,
    };
  }

  async getBoosts(user: User) {
    const { team } = await this.getMyTeam(user);

    const boosts = await this.boostRepo.find({
      where: { teamId: team.id },
      relations: ['gameweek'],
      order: { createdAt: 'DESC' },
    });

    const now = this.getNow();
    const nextGameweek = await this.gameweekRepo
      .createQueryBuilder('gw')
      .where('gw.snapshotDeadlineAt > :now', { now })
      .orderBy('gw.snapshotDeadlineAt', 'ASC')
      .getOne();

    const boostStatuses = Object.values(FantasyBoostType).map((type) => {
      if (!nextGameweek) {
        return {
          type,
          state: 'UNAVAILABLE' as const,
          isActive: false,
          isUsed: false,
          isAvailable: false,
          activeGameweekId: null,
          usedInGroup: false,
          usedInKnockout: false,
        };
      }

      const seasonBoosts = boosts.filter(
        (b) => b.gameweek?.externalSeasonId === nextGameweek.externalSeasonId,
      );

      const usedInGroup = seasonBoosts.some(
        (b) =>
          b.type === type && b.gameweek?.phase === FantasyGameweekPhase.GROUP,
      );
      const usedInKnockout = seasonBoosts.some(
        (b) =>
          b.type === type &&
          b.gameweek?.phase === FantasyGameweekPhase.KNOCKOUT,
      );

      const isActive = seasonBoosts.some(
        (b) => b.type === type && b.gameweekId === nextGameweek.id,
      );

      const usedInCurrentPhase =
        nextGameweek.phase === FantasyGameweekPhase.GROUP
          ? usedInGroup
          : usedInKnockout;

      const state = isActive
        ? ('ACTIVE' as const)
        : usedInCurrentPhase
          ? ('USED' as const)
          : ('AVAILABLE' as const);

      return {
        type,
        state,
        isActive,
        isUsed: state === 'USED' || state === 'ACTIVE',
        isAvailable: state === 'AVAILABLE',
        activeGameweekId: isActive ? nextGameweek.id : null,
        usedInGroup,
        usedInKnockout,
      };
    });

    return {
      availableBoosts: Object.values(FantasyBoostType),
      boosts,
      nextGameweek,
      boostStatuses,
    };
  }

  async getGameweeks() {
    const gameweeks = await this.gameweekRepo.find({
      order: {
        firstKickoffAt: 'ASC',
        id: 'ASC',
      },
    });

    const now = this.getNow();
    const nextGameweek =
      gameweeks.find((gw) => gw.snapshotDeadlineAt > now) ?? null;

    return { gameweeks, nextGameweek };
  }

  async getUpcomingFixtures(limit = 10) {
    const now = this.getNow();
    // Only return upcoming fixtures within the *current* gameweek.
    // If the last locked gameweek has no remaining future fixtures, fall back to the next gameweek.
    const nextOpenGameweek = await this.gameweekRepo.findOne({
      where: { snapshotDeadlineAt: MoreThan(now) },
      order: { snapshotDeadlineAt: 'ASC', id: 'ASC' },
    });

    if (!nextOpenGameweek) return [];

    const seasonId = nextOpenGameweek.externalSeasonId;
    const lastLockedGameweek = await this.gameweekRepo.findOne({
      where: {
        externalSeasonId: seasonId,
        snapshotDeadlineAt: LessThanOrEqual(now),
      },
      order: { snapshotDeadlineAt: 'DESC', id: 'DESC' },
    });

    let targetGameweek = nextOpenGameweek;
    if (lastLockedGameweek) {
      const hasUpcomingInLocked = await this.fixtureRepo.findOne({
        where: {
          gameweekId: lastLockedGameweek.id,
          startingAt: MoreThan(now),
        },
        select: ['id'],
        order: { startingAt: 'ASC' },
      });

      if (hasUpcomingInLocked) {
        targetGameweek = lastLockedGameweek;
      }
    }

    const fixtures = await this.fixtureRepo.find({
      where: { gameweekId: targetGameweek.id, startingAt: MoreThan(now) },
      order: { startingAt: 'ASC', id: 'ASC' },
      take: limit,
    });

    if (!fixtures.length) return [];

    const teamIds = Array.from(
      new Set(fixtures.flatMap((f) => f.participantTeamIds)),
    );

    const teams = await this.footballTeamRepo.find({
      where: { id: In(teamIds) as any },
    });
    const teamById = new Map(teams.map((t) => [t.id, t]));

    const gameweek = {
      id: targetGameweek.id,
      code: targetGameweek.code,
      name: targetGameweek.name,
      phase: targetGameweek.phase,
      firstKickoffAt: targetGameweek.firstKickoffAt,
      snapshotDeadlineAt: targetGameweek.snapshotDeadlineAt,
      isActive: targetGameweek.isActive,
    };

    return fixtures.map((f) => ({
      id: f.id,
      startingAt: f.startingAt,
      stageId: f.stageId,
      gameweekId: f.gameweekId,
      gameweek,
      participants: f.participantTeamIds.map((id) => teamById.get(id)),
    }));
  }

  async getTransferHistory(user: User) {
    const { team } = await this.getMyTeam(user);

    return this.transferRepo.find({
      where: { teamId: team.id },
      order: { createdAt: 'DESC' },
      relations: ['playerIn', 'playerOut'],
    });
  }

  async getFixturePerformance(user: User, limit = 5) {
    const { team } = await this.getMyTeam(user);

    // Aggregate totals per fixture for this team
    const rows = await this.pointsRepo
      .createQueryBuilder('p')
      .leftJoin(Fixture, 'f', 'f.id = p.fixtureId')
      .select('p.fixtureId', 'fixtureId')
      .addSelect('p.gameweekId', 'gameweekId')
      .addSelect('SUM(p.totalPoints)', 'totalPoints')
      .addSelect('MIN(f.startingAt)', 'startingAt')
      .where('p.teamId = :teamId', { teamId: team.id })
      .groupBy('p.fixtureId')
      .addGroupBy('p.gameweekId')
      .orderBy('MIN(f.startingAt)', 'ASC')
      .limit(limit)
      .getRawMany<{
        fixtureId: number;
        gameweekId: number | null;
        totalPoints: string;
        startingAt: string;
      }>();

    if (!rows.length) return [];

    const fixtureIds = rows.map((r) => r.fixtureId);
    const fixtures = await this.fixtureRepo.findBy({
      id: In(fixtureIds) as any,
    });
    const fixtureById = new Map(fixtures.map((f) => [f.id, f]));

    const rankings = await this.rankingRepo.find({
      where: { teamId: team.id, fixtureId: In(fixtureIds) as any },
    });
    const rankingByFixture = new Map(rankings.map((r) => [r.fixtureId, r]));

    const gameweekIds = Array.from(
      new Set(rows.map((r) => r.gameweekId).filter(Boolean) as number[]),
    );
    const gameweeks = await this.gameweekRepo.findBy({
      id: In(gameweekIds) as any,
    });
    const gameweekById = new Map(gameweeks.map((gw) => [gw.id, gw]));

    // Under per-gameweek snapshots, transfers are associated to the gameweek lock fixture (first fixture).
    // Preload transfers for those lock fixtures so they appear for all fixtures in the same gameweek.
    const gwFixtures = gameweekIds.length
      ? await this.fixtureRepo.find({
          where: { gameweekId: In(gameweekIds) as any },
          order: { startingAt: 'ASC' },
          select: ['id', 'gameweekId', 'startingAt'],
        })
      : [];
    const lockFixtureIdByGameweekId = new Map<number, number>();
    for (const f of gwFixtures) {
      if (!f.gameweekId) continue;
      if (!lockFixtureIdByGameweekId.has(f.gameweekId)) {
        lockFixtureIdByGameweekId.set(f.gameweekId, f.id);
      }
    }
    const lockFixtureIds = Array.from(
      new Set(Array.from(lockFixtureIdByGameweekId.values())),
    );
    const transfersByLockFixtureId = new Map<number, FantasyTransfer[]>();
    if (lockFixtureIds.length) {
      const transfers = await this.transferRepo.find({
        where: { teamId: team.id, fixtureId: In(lockFixtureIds) as any },
        relations: ['playerIn', 'playerOut'],
      });
      for (const t of transfers) {
        if (!t.fixtureId) continue;
        const arr = transfersByLockFixtureId.get(t.fixtureId) || [];
        arr.push(t);
        transfersByLockFixtureId.set(t.fixtureId, arr);
      }
    }

    const result = [];
    let cumulative = 0;

    for (const row of rows) {
      const fixture = fixtureById.get(row.fixtureId);
      if (!fixture) continue;

      const totalPoints = Number(row.totalPoints) || 0;
      cumulative += totalPoints;

      const fp = await this.pointsRepo.find({
        where: {
          teamId: team.id,
          fixtureId: row.fixtureId,
        },
        relations: ['squadPlayer', 'squadPlayer.player'],
      });

      const captainPoint = fp.find((p) => p.squadPlayer.isCaptain);
      const viceCaptainPoint = fp.find((p) => p.squadPlayer.isViceCaptain);

      const lockFixtureId = row.gameweekId
        ? (lockFixtureIdByGameweekId.get(row.gameweekId) ?? null)
        : null;
      const transfers = lockFixtureId
        ? transfersByLockFixtureId.get(lockFixtureId) || []
        : [];

      result.push({
        fixtureId: row.fixtureId,
        gameweekId: row.gameweekId,
        fixture,
        gameweek: row.gameweekId
          ? gameweekById.get(row.gameweekId) || null
          : null,
        totalPoints,
        cumulativePoints: cumulative,
        ranking: rankingByFixture.get(row.fixtureId) || null,
        captain: captainPoint
          ? {
              squadPlayerId: captainPoint.squadPlayerId,
              player: captainPoint.squadPlayer.player,
              points: captainPoint.totalPoints,
            }
          : null,
        viceCaptain: viceCaptainPoint
          ? {
              squadPlayerId: viceCaptainPoint.squadPlayerId,
              player: viceCaptainPoint.squadPlayer.player,
              points: viceCaptainPoint.totalPoints,
            }
          : null,
        transfers,
      });
    }

    return result;
  }

  async updateLineup(user: User, dto: UpdateLineupDto) {
    const gameweek = await this.getNextOpenGameweek();
    if (!gameweek) {
      throw new BadRequestException('Season is over: no upcoming gameweek');
    }
    this.ensureGameweekIsEditable(gameweek);
    const lockFixtureId = await this.getGameweekFirstFixtureId(gameweek.id);
    const { team, currentSquad } = await this.getMyTeam(user);
    this.ensureOwnership(team, user);
    if (!currentSquad) {
      throw new BadRequestException('You must create a squad first');
    }

    const baseSquad = await this.squadRepo.findOne({
      where: { id: currentSquad.id },
      relations: ['players', 'players.player'],
    });

    if (!baseSquad) throw new NotFoundException('Squad not found');

    const formationDef = parseFormation(dto.formation);

    const startingPlayerIds = dto.startingPlayerIds;
    const benchPlayerIds = dto.benchPlayerIds;

    if (startingPlayerIds.length !== this.fantasyConfig.startingXiSize) {
      throw new BadRequestException('Starting XI must have exactly 11 players');
    }
    if (benchPlayerIds.length !== this.fantasyConfig.benchSize) {
      throw new BadRequestException('Bench must have exactly 4 players');
    }

    const allIds = [...startingPlayerIds, ...benchPlayerIds];
    if (allIds.length !== this.fantasyConfig.squadSize) {
      throw new BadRequestException('Lineup must include all squad players');
    }

    const uniqueIds = new Set(allIds);
    if (uniqueIds.size !== allIds.length) {
      throw new BadRequestException('Duplicate player IDs in lineup');
    }

    // Ensure provided player IDs match the squad exactly
    const squadPlayerIds = baseSquad.players.map((sp) => sp.playerId);
    const squadSet = new Set(squadPlayerIds);
    for (const pid of allIds) {
      if (!squadSet.has(pid)) {
        throw new BadRequestException(
          'All lineup players must be in your squad',
        );
      }
    }

    const positionCounts: Record<string, number> = {
      GK: 0,
      DEF: 0,
      MID: 0,
      FWD: 0,
    };
    for (const sp of baseSquad.players) {
      if (startingPlayerIds.includes(sp.playerId)) {
        positionCounts[sp.position] = (positionCounts[sp.position] || 0) + 1;
      }
    }

    Object.entries(formationDef.positions).forEach(([pos, count]) => {
      if (positionCounts[pos] !== count) {
        throw new BadRequestException(
          `Formation ${formationDef.code} requires ${count} ${pos} in starting XI`,
        );
      }
    });

    // Per-gameweek policy: update the draft squad in-place (no snapshot per change)
    baseSquad.formation = dto.formation;
    for (const sp of baseSquad.players) {
      sp.isStarting = startingPlayerIds.includes(sp.playerId);
    }
    await this.squadRepo.save(baseSquad);
    await this.squadPlayerRepo.save(baseSquad.players);

    await this.eventRepo.save(
      this.eventRepo.create({
        teamId: team.id,
        type: FantasyEventType.BENCH_SWAP,
        fixtureId: lockFixtureId ?? undefined,
        payload: {
          startingPlayerIds,
          benchPlayerIds,
          formation: dto.formation,
          gameweekId: gameweek.id,
          lockFixtureId,
        },
        userId: user.id,
      }),
    );

    return { message: 'Lineup updated' };
  }

  async updateRoles(user: User, dto: UpdateRolesDto) {
    const gameweek = await this.getNextOpenGameweek();
    if (!gameweek) {
      throw new BadRequestException('Season is over: no upcoming gameweek');
    }
    this.ensureGameweekIsEditable(gameweek);
    const lockFixtureId = await this.getGameweekFirstFixtureId(gameweek.id);
    const { team, currentSquad } = await this.getMyTeam(user);
    this.ensureOwnership(team, user);
    if (!currentSquad) {
      throw new BadRequestException('You must create a squad first');
    }

    const baseSquad = await this.squadRepo.findOne({
      where: { id: currentSquad.id },
      relations: ['players', 'players.player'],
    });
    if (!baseSquad) throw new NotFoundException('Squad not found');

    const byPlayerId = new Map(
      baseSquad.players.map((sp) => [sp.playerId, sp]),
    );

    // Get current captain and vice-captain from existing squad
    const currentCaptain = baseSquad.players.find((sp) => sp.isCaptain);
    const currentViceCaptain = baseSquad.players.find((sp) => sp.isViceCaptain);

    // Determine final captain and vice-captain values (DTO takes precedence, fallback to existing)
    const finalCaptainId =
      dto.captainId !== undefined ? dto.captainId : currentCaptain?.playerId;
    const finalViceCaptainId =
      dto.viceCaptainId !== undefined
        ? dto.viceCaptainId
        : currentViceCaptain?.playerId;

    // Validate: captain and vice-captain must be different players
    // Note: A player CAN be both penalty taker and free kick taker
    if (
      finalCaptainId !== undefined &&
      finalViceCaptainId !== undefined &&
      finalCaptainId === finalViceCaptainId
    ) {
      throw new BadRequestException(
        'Captain and vice-captain must be different players',
      );
    }

    // Validate all role players are in the squad (using Set to handle duplicates)
    const rolePlayerIds = new Set(
      [
        dto.captainId,
        dto.viceCaptainId,
        dto.penaltyTakerId,
        dto.freeKickTakerId,
      ].filter((v) => v !== undefined && v !== null) as number[],
    );
    for (const id of rolePlayerIds) {
      if (!byPlayerId.has(id)) {
        throw new BadRequestException('All role players must be in your squad');
      }
    }

    // Per-gameweek policy: update the draft squad in-place
    for (const sp of baseSquad.players) {
      if (dto.captainId !== undefined) {
        sp.isCaptain = sp.playerId === dto.captainId;
      }
      if (dto.viceCaptainId !== undefined)
        sp.isViceCaptain = sp.playerId === dto.viceCaptainId;
      if (dto.penaltyTakerId !== undefined)
        sp.isPenaltyTaker = sp.playerId === dto.penaltyTakerId;
      if (dto.freeKickTakerId !== undefined)
        sp.isFreeKickTaker = sp.playerId === dto.freeKickTakerId;
    }
    await this.squadPlayerRepo.save(baseSquad.players);

    await this.eventRepo.save(
      this.eventRepo.create({
        teamId: team.id,
        type: FantasyEventType.ROLE_CHANGE,
        fixtureId: lockFixtureId ?? undefined,
        payload: { ...dto, gameweekId: gameweek.id, lockFixtureId },
        userId: user.id,
      }),
    );

    return { message: 'Roles updated' };
  }

  async makeTransfers(user: User, dto: TransferRequestDto) {
    if (this.fantasyConfig.transfersLocked) {
      throw new BadRequestException('Transfers are currently locked');
    }

    const gameweek = await this.getNextOpenGameweek();
    if (!gameweek) {
      throw new BadRequestException('Season is over: no upcoming gameweek');
    }
    this.ensureGameweekIsEditable(gameweek);
    const lockFixtureId = await this.getGameweekFirstFixtureId(gameweek.id);

    const { team, currentSquad } = await this.getMyTeam(user);
    this.ensureOwnership(team, user);
    if (!currentSquad) {
      throw new BadRequestException('You must create a squad first');
    }

    const baseSquad = await this.squadRepo.findOne({
      where: { id: currentSquad.id },
      relations: ['players', 'players.player'],
    });
    if (!baseSquad) throw new NotFoundException('Squad not found');

    const playerOutIds = dto.transfers
      .map((t) => t.playerOutId)
      .filter(Boolean) as number[];
    const playerInIds = dto.transfers.map((t) => t.playerInId);
    const allInIds = new Set(playerInIds);

    // Ensure no duplicate in targets
    if (allInIds.size !== playerInIds.length) {
      throw new BadRequestException(
        'Cannot transfer in the same player multiple times',
      );
    }

    const existingPlayerIds = baseSquad.players.map((sp) => sp.playerId);
    const finalPlayerIds = new Set<number>(existingPlayerIds);

    // Apply transfer effects
    for (const t of dto.transfers) {
      if (t.playerOutId) {
        if (!finalPlayerIds.has(t.playerOutId)) {
          throw new BadRequestException(
            'Cannot transfer out player not in your squad',
          );
        }
        finalPlayerIds.delete(t.playerOutId);
      }
      if (finalPlayerIds.has(t.playerInId)) {
        throw new BadRequestException(
          'Cannot have duplicate players in squad after transfers',
        );
      }
      finalPlayerIds.add(t.playerInId);
    }

    if (finalPlayerIds.size !== this.fantasyConfig.squadSize) {
      throw new BadRequestException(
        'Squad must remain at fixed size after transfers',
      );
    }

    const allPlayers = await this.playersService.getPlayersFromIds([
      ...Array.from(finalPlayerIds),
      ...playerOutIds,
      ...playerInIds,
    ]);

    const byId = new Map(allPlayers.map((p) => [p.id, p]));

    let budgetRemaining = Number(team.budgetRemaining);

    for (const t of dto.transfers) {
      const playerIn = byId.get(t.playerInId);
      if (!playerIn) throw new BadRequestException('Invalid incoming player');

      const priceIn = playerIn.price;
      let priceOut = 0;

      if (t.playerOutId) {
        const playerOut = byId.get(t.playerOutId);
        if (!playerOut)
          throw new BadRequestException('Invalid outgoing player');
        priceOut = playerOut.price;
      }

      const net = priceIn - priceOut;
      if (net > budgetRemaining) {
        throw new BadRequestException('Insufficient budget for transfer');
      }

      budgetRemaining -= net;

      await this.transferRepo.save(
        this.transferRepo.create({
          teamId: team.id,
          playerOutId: t.playerOutId ?? null,
          playerInId: t.playerInId,
          amountOut: priceOut,
          amountIn: priceIn,
          netAmount: net,
          type: TransferType.NORMAL,
          fixtureId: lockFixtureId ?? undefined,
          triggeredByUserId: user.id,
        }),
      );
    }

    // Update squad players
    const keepPlayerIds = Array.from(finalPlayerIds);
    const keepMap = new Map<number, Player>();
    for (const pid of keepPlayerIds) {
      const player = byId.get(pid);
      if (!player)
        throw new BadRequestException('Missing player data for final squad');
      keepMap.set(pid, player);
    }

    this.ensureMaxPlayersPerTeam([...keepMap.values()]);

    // Rebuild squad players but preserve starting/roles where possible
    const existingByPlayerId = new Map(
      baseSquad.players.map((sp) => [sp.playerId, sp]),
    );
    // For transferred-in players, inherit lineup/role flags from the transferred-out player.
    // This prevents starter/bench imbalance after transfers.
    const incomingDefaultsByPlayerId = new Map<
      number,
      Pick<
        FantasySquadPlayer,
        | 'isStarting'
        | 'isCaptain'
        | 'isViceCaptain'
        | 'isPenaltyTaker'
        | 'isFreeKickTaker'
      >
    >();
    for (const t of dto.transfers) {
      if (!t.playerOutId) continue;
      const outSp = existingByPlayerId.get(t.playerOutId);
      if (!outSp) continue;
      incomingDefaultsByPlayerId.set(t.playerInId, {
        isStarting: outSp.isStarting,
        isCaptain: outSp.isCaptain,
        isViceCaptain: outSp.isViceCaptain,
        isPenaltyTaker: outSp.isPenaltyTaker,
        isFreeKickTaker: outSp.isFreeKickTaker,
      });
    }
    const newSquadPlayers: FantasySquadPlayer[] = [];

    for (const pid of keepPlayerIds) {
      const player = keepMap.get(pid)!;
      const existingSp = existingByPlayerId.get(pid);
      const incomingDefaults = incomingDefaultsByPlayerId.get(pid);
      const position = mapPlayerToPositionCode(player);

      newSquadPlayers.push(
        this.squadPlayerRepo.create({
          squad: baseSquad,
          squadId: baseSquad.id,
          player,
          playerId: player.id,
          position,
          isStarting:
            existingSp?.isStarting ?? incomingDefaults?.isStarting ?? false,
          isCaptain:
            existingSp?.isCaptain ?? incomingDefaults?.isCaptain ?? false,
          isViceCaptain:
            existingSp?.isViceCaptain ??
            incomingDefaults?.isViceCaptain ??
            false,
          isPenaltyTaker:
            existingSp?.isPenaltyTaker ??
            incomingDefaults?.isPenaltyTaker ??
            false,
          isFreeKickTaker:
            existingSp?.isFreeKickTaker ??
            incomingDefaults?.isFreeKickTaker ??
            false,
        }),
      );
    }

    // Persist budget explicitly (avoids bigint/string serialization pitfalls)
    await this.teamRepo.update(team.id, { budgetRemaining });
    await this.squadPlayerRepo.delete({ squadId: baseSquad.id });
    await this.squadPlayerRepo.save(newSquadPlayers);

    await this.eventRepo.save(
      this.eventRepo.create({
        teamId: team.id,
        type: FantasyEventType.TRANSFER,
        fixtureId: lockFixtureId ?? undefined,
        payload: { ...dto, gameweekId: gameweek.id, lockFixtureId },
        userId: user.id,
      }),
    );

    return { message: 'Transfers completed', budgetRemaining };
  }

  async getHistory(user: User) {
    const { team } = await this.getMyTeam(user);
    const events = await this.eventRepo.find({
      where: { teamId: team.id },
      order: { createdAt: 'DESC' },
    });
    return { events };
  }

  /**
   * Backs the "Your Activity" panel: how many transfers the user has made,
   * which boosts they have used (with display labels), and when their team was
   * last updated (most recent transfer / boost / lineup or role change).
   */
  async getActivity(user: User) {
    const { team } = await this.getMyTeam(user);

    const [transfers, boosts, lastEvent] = await Promise.all([
      // Only count real (NORMAL) transfers; the INITIAL squad is not a transfer.
      this.transferRepo.find({
        where: { teamId: team.id, type: TransferType.NORMAL },
        order: { createdAt: 'DESC' },
        select: ['id', 'createdAt'],
      }),
      this.boostRepo.find({
        where: { teamId: team.id },
        order: { createdAt: 'DESC' },
      }),
      this.eventRepo.findOne({
        where: { teamId: team.id },
        order: { createdAt: 'DESC' },
        select: ['id', 'createdAt'],
      }),
    ]);

    const boostsUsed = boosts.map((b) => ({
      type: b.type,
      label: FANTASY_BOOST_LABELS[b.type] ?? b.type,
      gameweekId: b.gameweekId,
      usedAt: b.createdAt,
    }));

    // "Last update" = the most recent of any team-changing action.
    const candidateDates = [
      transfers[0]?.createdAt,
      boosts[0]?.createdAt,
      lastEvent?.createdAt,
    ].filter((d): d is Date => !!d);
    const lastUpdatedAt = candidateDates.length
      ? new Date(Math.max(...candidateDates.map((d) => new Date(d).getTime())))
      : null;

    return {
      transfersMade: transfers.length,
      boostsUsed,
      boostsUsedCount: boostsUsed.length,
      lastUpdatedAt,
    };
  }

  async getLeaderboard(fixtureId: number, user: User, page = 1, limit = 50) {
    const { team } = await this.getMyTeam(user);

    const [rankings, totalItems] = await this.rankingRepo.findAndCount({
      where: { fixtureId },
      relations: ['team', 'team.owner'],
      order: { rank: 'ASC' },
      skip: (page - 1) * limit,
      take: limit,
    });

    const meRanking = await this.rankingRepo.findOne({
      where: { fixtureId, teamId: team.id },
    });

    const itemsPerPage = limit;
    const itemCount = rankings.length;
    const totalPages = Math.max(1, Math.ceil(totalItems / itemsPerPage));

    return {
      data: rankings,
      meta: {
        totalItems,
        itemCount,
        itemsPerPage,
        totalPages,
        currentPage: page,
      },
      me: {
        teamId: team.id,
        rank: meRanking ? meRanking.rank : null,
        totalPoints: meRanking ? meRanking.totalPoints : 0,
        budgetRemaining: Number(team.budgetRemaining),
      },
    };
  }

  async getSeasonLeaderboard(user: User, page = 1, limit = 50) {
    const { team } = await this.getMyTeam(user);

    // Efficient, DB-driven leaderboard:
    // - include teams with no season row yet via LEFT JOIN + COALESCE
    // - compute rank across all teams via window function
    const totalItems = await this.teamRepo.count();
    const totalPages = Math.max(1, Math.ceil(totalItems / limit));
    const currentPage = Math.min(Math.max(page, 1), totalPages);

    const qb = this.teamRepo
      .createQueryBuilder('t')
      .leftJoinAndSelect('t.owner', 'owner')
      .leftJoin(FantasyTeamRanking, 'r', 'r.teamId = t.id AND r.fixtureId = 0')
      .addSelect('COALESCE(r.totalPoints, 0)', 'totalPoints')
      .addSelect('COALESCE(r.goals, 0)', 'goals')
      .addSelect('COALESCE(r.assists, 0)', 'assists')
      .addSelect('COALESCE(r.saves, 0)', 'saves')
      .addSelect('COALESCE(r.yellowCards, 0)', 'yellowCards')
      .addSelect('COALESCE(r.redCards, 0)', 'redCards')
      .addSelect('COALESCE(r.ownGoals, 0)', 'ownGoals')
      .addSelect('COALESCE(r.cleanSheets, 0)', 'cleanSheets')
      .addSelect(
        'RANK() OVER (ORDER BY COALESCE(r.totalPoints, 0) DESC)',
        'rank',
      )
      .orderBy('COALESCE(r.totalPoints, 0)', 'DESC')
      .addOrderBy('t.createdAt', 'ASC')
      .addOrderBy('t.id', 'ASC')
      .offset((currentPage - 1) * limit)
      .limit(limit);

    const { entities: teams, raw } = await qb.getRawAndEntities();

    const data: FantasyTeamRanking[] = teams.map((t, idx) =>
      this.rankingRepo.create({
        teamId: t.id,
        fixtureId: 0,
        totalPoints: Number(raw[idx]?.totalPoints) || 0,
        goals: Number(raw[idx]?.goals) || 0,
        assists: Number(raw[idx]?.assists) || 0,
        saves: Number(raw[idx]?.saves) || 0,
        yellowCards: Number(raw[idx]?.yellowCards) || 0,
        redCards: Number(raw[idx]?.redCards) || 0,
        ownGoals: Number(raw[idx]?.ownGoals) || 0,
        cleanSheets: Number(raw[idx]?.cleanSheets) || 0,
        rank: Number(raw[idx]?.rank) || 1,
        team: t,
      }),
    );

    // "Me" rank/points without scanning all teams:
    const myRow = await this.teamRepo
      .createQueryBuilder('t')
      .leftJoin(FantasyTeamRanking, 'r', 'r.teamId = t.id AND r.fixtureId = 0')
      .select('COALESCE(r.totalPoints, 0)', 'totalPoints')
      .addSelect('COALESCE(r.goals, 0)', 'goals')
      .addSelect('COALESCE(r.assists, 0)', 'assists')
      .addSelect('COALESCE(r.saves, 0)', 'saves')
      .addSelect('COALESCE(r.yellowCards, 0)', 'yellowCards')
      .addSelect('COALESCE(r.redCards, 0)', 'redCards')
      .addSelect('COALESCE(r.ownGoals, 0)', 'ownGoals')
      .addSelect('COALESCE(r.cleanSheets, 0)', 'cleanSheets')
      .where('t.id = :teamId', { teamId: team.id })
      .getRawOne<{
        totalPoints: string;
        goals: string;
        assists: string;
        saves: string;
        yellowCards: string;
        redCards: string;
        ownGoals: string;
        cleanSheets: string;
      }>();

    const myPoints = Number(myRow?.totalPoints) || 0;
    const betterCount = await this.teamRepo
      .createQueryBuilder('t')
      .leftJoin(FantasyTeamRanking, 'r', 'r.teamId = t.id AND r.fixtureId = 0')
      .where('COALESCE(r.totalPoints, 0) > :p', { p: myPoints })
      .getCount();

    const me = {
      teamId: team.id,
      rank: betterCount + 1,
      totalPoints: myPoints,
      goals: Number(myRow?.goals) || 0,
      assists: Number(myRow?.assists) || 0,
      saves: Number(myRow?.saves) || 0,
      yellowCards: Number(myRow?.yellowCards) || 0,
      redCards: Number(myRow?.redCards) || 0,
      ownGoals: Number(myRow?.ownGoals) || 0,
      cleanSheets: Number(myRow?.cleanSheets) || 0,
      budgetRemaining: Number(team.budgetRemaining),
    };

    return {
      data,
      meta: {
        totalItems,
        itemCount: data.length,
        itemsPerPage: limit,
        totalPages,
        currentPage,
      },
      me,
    };
  }

  async getGameweekLeaderboard(
    gameweekId: number,
    user: User,
    page = 1,
    limit = 50,
  ) {
    const { team } = await this.getMyTeam(user);

    const [rankings, totalItems] = await this.rankingRepo.findAndCount({
      where: { gameweekId, fixtureId: -1 },
      relations: ['team', 'team.owner'],
      order: { rank: 'ASC' },
      skip: (page - 1) * limit,
      take: limit,
    });

    const meRanking = await this.rankingRepo.findOne({
      where: { gameweekId, fixtureId: -1, teamId: team.id },
    });

    const itemsPerPage = limit;
    const itemCount = rankings.length;
    const totalPages = Math.max(1, Math.ceil(totalItems / itemsPerPage));

    return {
      data: rankings,
      meta: {
        totalItems,
        itemCount,
        itemsPerPage,
        totalPages,
        currentPage: page,
      },
      me: {
        teamId: team.id,
        rank: meRanking ? meRanking.rank : null,
        totalPoints: meRanking ? meRanking.totalPoints : 0,
        budgetRemaining: Number(team.budgetRemaining),
      },
    };
  }
}

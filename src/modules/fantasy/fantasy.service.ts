import {
  BadRequestException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { In, Repository } from 'typeorm';
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
import { FantasyConfig, FormationCode } from '@/common/config/fantasy.config';
import { mapPlayerToPositionCode, getFormationDef } from './fantasy.utils';
import {
  FantasyBoostType,
  FantasyEventType,
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
  ) {
    this.fantasyConfig = this.configService.get('fantasy', { infer: true })!;
  }

  private ensureOwnership(team: FantasyTeam, user: User) {
    if (team.ownerId !== user.id) {
      throw new ForbiddenException('You do not own this fantasy team');
    }
  }

  private getNow(): Date {
    const iso = this.fantasyConfig.nowOverrideIso;
    if (!iso) return new Date();

    const d = new Date(iso);
    if (Number.isNaN(d.getTime())) {
      // Fail safe: if misconfigured, behave like normal "now"
      return new Date();
    }
    return d;
  }

  /**
   * Clients should NOT send fixtureId for team actions.
   * We treat the next upcoming fixture as the active one for edits/transfers.
   */
  private async getNextUpcomingFixtureId(): Promise<number> {
    const now = this.getNow();
    const next = await this.fixtureRepo
      .createQueryBuilder('f')
      .where('f.startingAt > :now', { now })
      .orderBy('f.startingAt', 'ASC')
      .getOne();

    if (!next) {
      throw new BadRequestException('No upcoming fixture available');
    }

    return next.id;
  }

  private async ensureFixtureIsEditable(fixtureId: number) {
    const fixture = await this.fixturesService.getFixtureById(fixtureId, []);

    const kickoffMs =
      (fixture.starting_at_timestamp || 0) * 1000 ||
      Date.parse(fixture.starting_at);

    if (!kickoffMs) {
      throw new BadRequestException('Unable to determine fixture kickoff time');
    }

    const nowMs = this.getNow().getTime();
    if (nowMs >= kickoffMs) {
      throw new BadRequestException(
        'Changes are not allowed after fixture has started',
      );
    }
  }

  async getMyTeam(user: User) {
    const team = await this.teamRepo.findOne({
      where: { ownerId: user.id },
      relations: ['squads', 'squads.players', 'squads.players.player'],
    });
    if (!team) throw new NotFoundException('Fantasy team not found');

    const currentSquad = team.squads.find((s) => s.isCurrent);
    return { team, currentSquad };
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

    const hasSquad = await this.squadRepo.count({
      where: { teamId: team.id },
    });
    if (hasSquad > 0) {
      throw new BadRequestException('You already have a fantasy squad');
    }

    const formationDef = getFormationDef(this.fantasyConfig, dto.formation);
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

    // First create and persist the squad so it has an ID
    const squad = await this.squadRepo.save(
      this.squadRepo.create({
        team,
        teamId: team.id,
        formation: dto.formation as FormationCode,
        isCurrent: true,
      }),
    );

    // Then create squad players with an explicit squadId
    const squadPlayers = dto.squad.map((item) => {
      const player = players.find((p) => p.id === item.playerId)!;
      const position = mapPlayerToPositionCode(player);
      return this.squadPlayerRepo.create({
        squad,
        squadId: squad.id,
        player,
        playerId: player.id,
        position,
        isStarting: item.isStarting,
        isCaptain: item.isCaptain ?? false,
        isViceCaptain: item.isViceCaptain ?? false,
        isPenaltyTaker: item.isPenaltyTaker ?? false,
        isFreeKickTaker: item.isFreeKickTaker ?? false,
      });
    });

    await this.squadPlayerRepo.save(squadPlayers);

    team.budgetTotal = initialBudget;
    team.budgetRemaining = initialBudget - totalCost;

    await this.teamRepo.save(team);

    await this.eventRepo.save(
      this.eventRepo.create({
        team,
        teamId: team.id,
        type: FantasyEventType.TRANSFER,
        payload: {
          type: TransferType.INITIAL,
          playerIds,
        },
        userId: user.id,
      }),
    );

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

    const existing = await this.boostRepo.findOne({
      where: { teamId: team.id, gameweekId: gameweek.id },
    });
    if (existing) {
      throw new BadRequestException(
        'You already have a boost applied for this gameweek',
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

    return boosts;
  }

  async getUpcomingFixtures(limit = 10) {
    const now = this.getNow();
    const fixtures = await this.fixtureRepo
      .createQueryBuilder('f')
      .where('f.startingAt > :now', { now })
      .orderBy('f.startingAt', 'ASC')
      .limit(limit)
      .getMany();

    if (!fixtures.length) return [];

    const teamIds = Array.from(
      new Set(fixtures.flatMap((f) => f.participantTeamIds)),
    );

    const teams = await this.footballTeamRepo.find({
      where: { id: In(teamIds) as any },
    });
    const teamById = new Map(teams.map((t) => [t.id, t]));

    return fixtures.map((f) => ({
      id: f.id,
      startingAt: f.startingAt,
      stageId: f.stageId,
      gameweekId: f.gameweekId,
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
      .where('p.teamId = :teamId', { teamId: team.id })
      .groupBy('p.fixtureId')
      .addGroupBy('p.gameweekId')
      .orderBy('f.startingAt', 'ASC')
      .limit(limit)
      .getRawMany<{
        fixtureId: number;
        gameweekId: number | null;
        totalPoints: string;
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

      const transfers = await this.transferRepo.find({
        where: { teamId: team.id, fixtureId: row.fixtureId },
        relations: ['playerIn', 'playerOut'],
      });

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
    const fixtureId = await this.getNextUpcomingFixtureId();
    await this.ensureFixtureIsEditable(fixtureId);
    const { team, currentSquad } = await this.getMyTeam(user);
    this.ensureOwnership(team, user);

    const baseSquad = await this.squadRepo.findOne({
      where: { id: currentSquad.id },
      relations: ['players', 'players.player'],
    });

    if (!baseSquad) throw new NotFoundException('Squad not found');

    const formationDef = getFormationDef(this.fantasyConfig, dto.formation);

    const startingIds = dto.startingPlayerIds;
    const benchIds = dto.benchPlayerIds;

    if (startingIds.length !== this.fantasyConfig.startingXiSize) {
      throw new BadRequestException('Starting XI must have exactly 11 players');
    }
    if (benchIds.length !== this.fantasyConfig.benchSize) {
      throw new BadRequestException('Bench must have exactly 4 players');
    }

    const allIds = [...startingIds, ...benchIds];
    if (allIds.length !== this.fantasyConfig.squadSize) {
      throw new BadRequestException('Lineup must include all squad players');
    }

    const uniqueIds = new Set(allIds);
    if (uniqueIds.size !== allIds.length) {
      throw new BadRequestException('Duplicate squad player IDs in lineup');
    }

    const positionCounts: Record<string, number> = {
      GK: 0,
      DEF: 0,
      MID: 0,
      FWD: 0,
    };
    for (const sp of baseSquad.players) {
      if (startingIds.includes(sp.id)) {
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

    // Create a new squad snapshot for this lineup change
    await this.squadRepo.update(
      { teamId: team.id, isCurrent: true },
      { isCurrent: false },
    );

    const newSquad = await this.squadRepo.save(
      this.squadRepo.create({
        team,
        teamId: team.id,
        formation: dto.formation as FormationCode,
        isCurrent: true,
      }),
    );

    const newSquadPlayers = baseSquad.players.map((sp) =>
      this.squadPlayerRepo.create({
        squad: newSquad,
        squadId: newSquad.id,
        player: sp.player,
        playerId: sp.playerId,
        position: sp.position,
        isStarting: startingIds.includes(sp.id),
        isCaptain: sp.isCaptain,
        isViceCaptain: sp.isViceCaptain,
        isPenaltyTaker: sp.isPenaltyTaker,
        isFreeKickTaker: sp.isFreeKickTaker,
      }),
    );

    await this.squadPlayerRepo.save(newSquadPlayers);

    await this.eventRepo.save(
      this.eventRepo.create({
        teamId: team.id,
        type: FantasyEventType.BENCH_SWAP,
        fixtureId,
        payload: { startingIds, benchIds, formation: dto.formation, fixtureId },
        userId: user.id,
      }),
    );

    return { message: 'Lineup updated' };
  }

  async updateRoles(user: User, dto: UpdateRolesDto) {
    const fixtureId = await this.getNextUpcomingFixtureId();
    await this.ensureFixtureIsEditable(fixtureId);
    const { team, currentSquad } = await this.getMyTeam(user);
    this.ensureOwnership(team, user);

    const baseSquad = await this.squadRepo.findOne({
      where: { id: currentSquad.id },
      relations: ['players'],
    });
    if (!baseSquad) throw new NotFoundException('Squad not found');

    const ids = [
      dto.captainId,
      dto.viceCaptainId,
      dto.penaltyTakerId,
      dto.freeKickTakerId,
    ].filter(Boolean) as string[];
    const unique = new Set(ids);
    if (unique.size !== ids.length) {
      throw new BadRequestException(
        'A player cannot hold multiple roles simultaneously',
      );
    }

    const byId = new Map(baseSquad.players.map((sp) => [sp.id, sp]));
    for (const id of ids) {
      if (!byId.has(id)) {
        throw new BadRequestException('All role players must be in your squad');
      }
    }

    // Create a new squad snapshot for this role change
    await this.squadRepo.update(
      { teamId: team.id, isCurrent: true },
      { isCurrent: false },
    );

    const newSquad = await this.squadRepo.save(
      this.squadRepo.create({
        team,
        teamId: team.id,
        formation: baseSquad.formation,
        isCurrent: true,
      }),
    );

    const newSquadPlayers = baseSquad.players.map((sp) =>
      this.squadPlayerRepo.create({
        squad: newSquad,
        squadId: newSquad.id,
        player: sp.player,
        playerId: sp.playerId,
        position: sp.position,
        isStarting: sp.isStarting,
        isCaptain:
          dto.captainId !== undefined ? sp.id === dto.captainId : sp.isCaptain,
        isViceCaptain:
          dto.viceCaptainId !== undefined
            ? sp.id === dto.viceCaptainId
            : sp.isViceCaptain,
        isPenaltyTaker:
          dto.penaltyTakerId !== undefined
            ? sp.id === dto.penaltyTakerId
            : sp.isPenaltyTaker,
        isFreeKickTaker:
          dto.freeKickTakerId !== undefined
            ? sp.id === dto.freeKickTakerId
            : sp.isFreeKickTaker,
      }),
    );

    await this.squadPlayerRepo.save(newSquadPlayers);

    await this.eventRepo.save(
      this.eventRepo.create({
        teamId: team.id,
        type: FantasyEventType.ROLE_CHANGE,
        fixtureId,
        payload: { ...dto, fixtureId },
        userId: user.id,
      }),
    );

    return { message: 'Roles updated' };
  }

  async makeTransfers(user: User, dto: TransferRequestDto) {
    if (this.fantasyConfig.transfersLocked) {
      throw new BadRequestException('Transfers are currently locked');
    }

    const fixtureId = await this.getNextUpcomingFixtureId();
    await this.ensureFixtureIsEditable(fixtureId);

    const { team, currentSquad } = await this.getMyTeam(user);
    this.ensureOwnership(team, user);

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
          fixtureId,
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

    // Rebuild squad players but preserve starting/roles where possible
    const existingByPlayerId = new Map(
      baseSquad.players.map((sp) => [sp.playerId, sp]),
    );
    const newSquadPlayers: FantasySquadPlayer[] = [];

    // Create a new squad snapshot for this transfer set
    await this.squadRepo.update(
      { teamId: team.id, isCurrent: true },
      { isCurrent: false },
    );

    const newSquad = await this.squadRepo.save(
      this.squadRepo.create({
        team,
        teamId: team.id,
        formation: baseSquad.formation,
        isCurrent: true,
      }),
    );

    for (const pid of keepPlayerIds) {
      const player = keepMap.get(pid)!;
      const existingSp = existingByPlayerId.get(pid);
      const position = mapPlayerToPositionCode(player);

      newSquadPlayers.push(
        this.squadPlayerRepo.create({
          squad: newSquad,
          squadId: newSquad.id,
          player,
          playerId: player.id,
          position,
          isStarting: existingSp?.isStarting ?? false,
          isCaptain: existingSp?.isCaptain ?? false,
          isViceCaptain: existingSp?.isViceCaptain ?? false,
          isPenaltyTaker: existingSp?.isPenaltyTaker ?? false,
          isFreeKickTaker: existingSp?.isFreeKickTaker ?? false,
        }),
      );
    }

    team.budgetRemaining = budgetRemaining;

    await this.teamRepo.save(team);
    await this.squadPlayerRepo.save(newSquadPlayers);

    await this.eventRepo.save(
      this.eventRepo.create({
        teamId: team.id,
        type: FantasyEventType.TRANSFER,
        fixtureId,
        payload: { ...dto, fixtureId },
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

    const [rankings, totalItems] = await this.rankingRepo.findAndCount({
      where: { fixtureId: 0 },
      relations: ['team', 'team.owner'],
      order: { rank: 'ASC' },
      skip: (page - 1) * limit,
      take: limit,
    });

    const meRanking = await this.rankingRepo.findOne({
      where: { fixtureId: 0, teamId: team.id },
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

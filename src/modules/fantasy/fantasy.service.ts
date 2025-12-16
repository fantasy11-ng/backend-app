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
import { FantasyConfig } from '@/common/config/fantasy.config';
import { mapPlayerToPositionCode, parseFormation } from './fantasy.utils';
import {
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
   * Returns the next gameweek whose snapshot deadline is still in the future.
   * This is the gameweek the user is currently "editing towards".
   */
  private async getNextOpenGameweek(): Promise<FantasyGameweek> {
    const now = this.getNow();
    const gw = await this.gameweekRepo
      .createQueryBuilder('gw')
      .where('gw.snapshotDeadlineAt > :now', { now })
      .orderBy('gw.snapshotDeadlineAt', 'ASC')
      .getOne();

    if (!gw) {
      throw new BadRequestException('No upcoming gameweek available');
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

    // If the team exists but the user hasn't created an initial squad yet,
    // return the team and let the client prompt squad creation.
    if (!team.squads?.length) {
      return { team, currentSquad: null };
    }

    const gameweek = await this.getNextOpenGameweek();
    const currentSquad = await this.getOrCreateDraftSquadForGameweek(
      team,
      gameweek,
    );
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
    this.ensureGameweekIsEditable(gameweek);
    const lockFixtureId = await this.getGameweekFirstFixtureId(gameweek.id);
    const { team, currentSquad } = await this.getMyTeam(user);
    this.ensureOwnership(team, user);

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
    this.ensureGameweekIsEditable(gameweek);
    const lockFixtureId = await this.getGameweekFirstFixtureId(gameweek.id);
    const { team, currentSquad } = await this.getMyTeam(user);
    this.ensureOwnership(team, user);

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
    this.ensureGameweekIsEditable(gameweek);
    const lockFixtureId = await this.getGameweekFirstFixtureId(gameweek.id);

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

    // Rebuild squad players but preserve starting/roles where possible
    const existingByPlayerId = new Map(
      baseSquad.players.map((sp) => [sp.playerId, sp]),
    );
    const newSquadPlayers: FantasySquadPlayer[] = [];

    for (const pid of keepPlayerIds) {
      const player = keepMap.get(pid)!;
      const existingSp = existingByPlayerId.get(pid);
      const position = mapPlayerToPositionCode(player);

      newSquadPlayers.push(
        this.squadPlayerRepo.create({
          squad: baseSquad,
          squadId: baseSquad.id,
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
        rank: Number(raw[idx]?.rank) || 1,
        team: t,
      }),
    );

    // "Me" rank/points without scanning all teams:
    const myRow = await this.teamRepo
      .createQueryBuilder('t')
      .leftJoin(FantasyTeamRanking, 'r', 'r.teamId = t.id AND r.fixtureId = 0')
      .select('COALESCE(r.totalPoints, 0)', 'totalPoints')
      .where('t.id = :teamId', { teamId: team.id })
      .getRawOne<{ totalPoints: string }>();

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

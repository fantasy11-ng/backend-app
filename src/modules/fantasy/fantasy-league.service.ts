import {
  BadRequestException,
  Injectable,
  InternalServerErrorException,
  NotFoundException,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { In, LessThan, LessThanOrEqual, Repository } from 'typeorm';
import { FantasyLeague } from './entities/fantasy-league.entity';
import { FantasyLeagueMembership } from './entities/fantasy-league-membership.entity';
import { FantasyTeamRanking } from './entities/fantasy-team-ranking.entity';
import { FantasyService } from './fantasy.service';
import { User } from '@/modules/users/entities/user.entity';
import {
  CreateFantasyLeagueDto,
  InsightMetricUnit,
  InsightWidgetCardDto,
  InsightWidgetItemDto,
  InsightWidgetPlayerDto,
  LeagueInsightsResponseDto,
  LeagueInsightsTableRowDto,
} from './dto';
import { ConfigService } from '@nestjs/config';
import { MainConfig } from '@/common/config/main.config';
import { FantasyGameweek } from './entities/fantasy-gameweek.entity';
import { FantasyTimeService } from './fantasy-time.service';
import { FantasySquad } from './entities/fantasy-squad.entity';
import { FantasySquadPlayer } from './entities/fantasy-squad-player.entity';
import { FantasyTransfer } from './entities/fantasy-transfer.entity';
import { FantasyPoints } from './entities/fantasy-points.entity';
import { Player } from '@/modules/players/entities/player.entity';

@Injectable()
export class FantasyLeagueService {
  private readonly leagueMaxParticipants: number;

  constructor(
    private readonly fantasyService: FantasyService,
    private readonly configService: ConfigService<MainConfig>,
    private readonly fantasyTimeService: FantasyTimeService,
    @InjectRepository(FantasyLeague)
    private readonly leagueRepo: Repository<FantasyLeague>,
    @InjectRepository(FantasyLeagueMembership)
    private readonly membershipRepo: Repository<FantasyLeagueMembership>,
    @InjectRepository(FantasyTeamRanking)
    private readonly rankingRepo: Repository<FantasyTeamRanking>,
    @InjectRepository(FantasyGameweek)
    private readonly gameweekRepo: Repository<FantasyGameweek>,
    @InjectRepository(FantasySquad)
    private readonly squadRepo: Repository<FantasySquad>,
    @InjectRepository(FantasySquadPlayer)
    private readonly squadPlayerRepo: Repository<FantasySquadPlayer>,
    @InjectRepository(FantasyTransfer)
    private readonly transferRepo: Repository<FantasyTransfer>,
    @InjectRepository(FantasyPoints)
    private readonly pointsRepo: Repository<FantasyPoints>,
    @InjectRepository(Player)
    private readonly playerRepo: Repository<Player>,
  ) {
    const fantasyConfig = this.configService.get('fantasy', {
      infer: true,
    });
    this.leagueMaxParticipants = fantasyConfig?.leagueMaxParticipants ?? 200;
  }

  private getNow(): Date {
    return this.fantasyTimeService.getNow();
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

  private roundPercent(numerator: number, denominator: number): number {
    if (!denominator) return 0;
    return Math.round((numerator / denominator) * 100);
  }

  private computeRanksByPoints(teamIds: string[], totalsByTeamId: Map<string, number>) {
    const rows = teamIds.map((teamId) => ({
      teamId,
      points: totalsByTeamId.get(teamId) ?? 0,
    }));

    rows.sort((a, b) =>
      b.points !== a.points ? b.points - a.points : a.teamId.localeCompare(b.teamId),
    );

    const rankByTeamId = new Map<string, number>();
    let currentRank = 1;
    let lastPoints: number | null = null;

    for (let i = 0; i < rows.length; i++) {
      const { teamId, points } = rows[i];
      if (lastPoints !== null && points < lastPoints) {
        currentRank = i + 1;
      }
      lastPoints = points;
      rankByTeamId.set(teamId, currentRank);
    }

    return { rankByTeamId, totalsByTeamId };
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

  private async getPreviousLockedGameweek(
    gameweek: FantasyGameweek,
  ): Promise<FantasyGameweek | null> {
    const gws = await this.gameweekRepo.find({
      where: { snapshotDeadlineAt: LessThan(gameweek.snapshotDeadlineAt) },
      order: { snapshotDeadlineAt: 'DESC' },
      take: 1,
    });
    return gws[0] ?? null;
  }

  private async getLockedSquadIdsForTeams(
    teamIds: string[],
    gameweek: FantasyGameweek | null,
  ): Promise<string[]> {
    if (!teamIds.length) return [];

    if (gameweek) {
      const squads = await this.squadRepo.find({
        where: {
          isLocked: true,
          gameweekId: gameweek.id,
          teamId: In(teamIds) as any,
        },
        select: ['id'],
      });
      if (squads.length) return squads.map((s) => s.id);
    }

    // Fallback: most recent locked squad per team.
    const allLocked = await this.squadRepo.find({
      where: { isLocked: true, teamId: In(teamIds) as any },
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

  private async getTeamTotalsUpToGameweek(params: {
    teamIds: string[];
    gameweekId?: number | null;
  }): Promise<Map<string, number>> {
    const { teamIds, gameweekId } = params;
    if (!teamIds.length) return new Map();

    const qb = this.pointsRepo
      .createQueryBuilder('p')
      .select('p.teamId', 'teamId')
      .addSelect('SUM(p.totalPoints)', 'totalPoints')
      .where('p.teamId IN (:...teamIds)', { teamIds })
      .andWhere('p.gameweekId IS NOT NULL');

    if (gameweekId != null) {
      qb.andWhere('p.gameweekId <= :gwId', { gwId: gameweekId });
    }

    const raw = await qb
      .groupBy('p.teamId')
      .orderBy('SUM(p.totalPoints)', 'DESC')
      .getRawMany<{ teamId: string; totalPoints: string }>();

    const totals = new Map<string, number>(teamIds.map((id) => [id, 0]));
    for (const r of raw) {
      totals.set(r.teamId, Number(r.totalPoints) || 0);
    }
    return totals;
  }

  private async generateInviteCode(): Promise<string> {
    const chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789';
    const attempts = 10;

    for (let i = 0; i < attempts; i++) {
      let code = '';
      for (let j = 0; j < 10; j++) {
        const idx = Math.floor(Math.random() * chars.length);
        code += chars[idx];
      }

      const existing = await this.leagueRepo.findOne({
        where: { inviteCode: code },
      });
      if (!existing) {
        return code;
      }
    }

    throw new InternalServerErrorException(
      'Could not generate a unique invite code, please try again',
    );
  }

  async createLeague(user: User, dto: CreateFantasyLeagueDto) {
    const { team } = await this.fantasyService.getMyTeam(user);
    const isPublic = dto.isPublic ?? false;

    const inviteCode = isPublic ? null : await this.generateInviteCode();

    const league = this.leagueRepo.create({
      name: dto.name.trim(),
      isPublic,
      inviteCode,
      ownerId: user.id,
      owner: user,
    });

    await this.leagueRepo.save(league);

    const membership = this.membershipRepo.create({
      leagueId: league.id,
      league,
      teamId: team.id,
      team,
    });

    await this.membershipRepo.save(membership);

    const participantCount = 1;

    return {
      message: 'League created',
      league: {
        id: league.id,
        name: league.name,
        isPublic: league.isPublic,
        inviteCode: league.inviteCode,
        participantCount,
        maxParticipants: this.leagueMaxParticipants,
      },
    };
  }

  async joinLeagueById(user: User, leagueId: string) {
    const { team } = await this.fantasyService.getMyTeam(user);

    const league = await this.leagueRepo.findOne({
      where: { id: leagueId },
    });
    if (!league) {
      throw new NotFoundException('League not found');
    }

    if (!league.isPublic) {
      throw new BadRequestException(
        'Cannot join a private league by ID. Use invite code instead.',
      );
    }

    const existing = await this.membershipRepo.findOne({
      where: { leagueId: league.id, teamId: team.id },
    });
    if (existing) {
      throw new BadRequestException('You are already a member of this league');
    }

    const currentCount = await this.membershipRepo.count({
      where: { leagueId: league.id },
    });
    if (currentCount >= this.leagueMaxParticipants) {
      throw new BadRequestException('League has reached maximum participants');
    }

    const membership = this.membershipRepo.create({
      leagueId: league.id,
      league,
      teamId: team.id,
      team,
    });
    await this.membershipRepo.save(membership);

    return {
      message: 'Joined league',
    };
  }

  async joinLeagueByInviteCode(user: User, inviteCode: string) {
    const { team } = await this.fantasyService.getMyTeam(user);

    const league = await this.leagueRepo.findOne({
      where: { inviteCode },
    });
    if (!league) {
      throw new NotFoundException('League not found for this invite code');
    }

    const existing = await this.membershipRepo.findOne({
      where: { leagueId: league.id, teamId: team.id },
    });
    if (existing) {
      throw new BadRequestException('You are already a member of this league');
    }

    const currentCount = await this.membershipRepo.count({
      where: { leagueId: league.id },
    });
    if (currentCount >= this.leagueMaxParticipants) {
      throw new BadRequestException('League has reached maximum participants');
    }

    const membership = this.membershipRepo.create({
      leagueId: league.id,
      league,
      teamId: team.id,
      team,
    });
    await this.membershipRepo.save(membership);

    return {
      message: 'Joined league',
    };
  }

  async leaveLeague(user: User, leagueId: string) {
    const { team } = await this.fantasyService.getMyTeam(user);

    const league = await this.leagueRepo.findOne({
      where: { id: leagueId },
    });
    if (!league) {
      throw new NotFoundException('League not found');
    }

    const membership = await this.membershipRepo.findOne({
      where: { leagueId: league.id, teamId: team.id },
    });
    if (!membership) {
      throw new BadRequestException('You are not a member of this league');
    }

    await this.membershipRepo.remove(membership);

    return {
      message: 'Left league',
    };
  }

  async getMyLeagues(user: User) {
    const { team } = await this.fantasyService.getMyTeam(user);

    const memberships = await this.membershipRepo.find({
      where: { teamId: team.id },
      relations: ['league'],
      order: {
        joinedAt: 'DESC',
      },
    });

    if (!memberships.length) {
      return { leagues: [] };
    }

    const leagueIds = memberships.map((m) => m.leagueId);
    const countsRaw = await this.membershipRepo
      .createQueryBuilder('m')
      .select('m.leagueId', 'leagueId')
      .addSelect('COUNT(m.id)', 'count')
      .where('m.leagueId IN (:...leagueIds)', { leagueIds })
      .groupBy('m.leagueId')
      .getRawMany<{ leagueId: string; count: string }>();

    const counts = new Map<string, number>(
      countsRaw.map((row) => [row.leagueId, parseInt(row.count, 10)]),
    );

    const leagues = memberships.map((m) => ({
      league: m.league,
      participantCount: counts.get(m.leagueId) ?? 1,
      maxParticipants: this.leagueMaxParticipants,
      isOwner: m.league.ownerId === user.id,
    }));

    return { leagues };
  }

  async getLeagueSeasonLeaderboard(
    user: User,
    leagueId: string,
    page = 1,
    limit = 50,
  ) {
    const { team: myTeam } = await this.fantasyService.getMyTeam(user);

    const league = await this.leagueRepo.findOne({
      where: { id: leagueId },
    });
    if (!league) {
      throw new NotFoundException('League not found');
    }

    const totalItems = await this.membershipRepo.count({
      where: { leagueId: league.id },
    });

    const totalPages = Math.max(1, Math.ceil(totalItems / limit));
    const currentPage = Math.min(Math.max(page, 1), totalPages);

    const qb = this.membershipRepo
      .createQueryBuilder('m')
      .innerJoinAndSelect('m.team', 't')
      .leftJoinAndSelect('t.owner', 'owner')
      .leftJoin(
        FantasyTeamRanking,
        'r',
        'r.teamId = m.teamId AND r.fixtureId = 0',
      )
      .where('m.leagueId = :leagueId', { leagueId: league.id })
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
      .addOrderBy('m.joinedAt', 'ASC')
      .addOrderBy('m.teamId', 'ASC')
      .offset((currentPage - 1) * limit)
      .limit(limit);

    const { entities: memberships, raw } = await qb.getRawAndEntities();
    if (!memberships.length) {
      return {
        data: [],
        meta: {
          totalItems,
          itemCount: 0,
          itemsPerPage: limit,
          totalPages: Math.max(1, Math.ceil(totalItems / limit)),
          currentPage,
        },
        me: null,
      };
    }

    const data = memberships.map((m, idx) => ({
      team: m.team,
      totalPoints: Number(raw[idx]?.totalPoints) || 0,
      goals: Number(raw[idx]?.goals) || 0,
      assists: Number(raw[idx]?.assists) || 0,
      saves: Number(raw[idx]?.saves) || 0,
      yellowCards: Number(raw[idx]?.yellowCards) || 0,
      redCards: Number(raw[idx]?.redCards) || 0,
      ownGoals: Number(raw[idx]?.ownGoals) || 0,
      cleanSheets: Number(raw[idx]?.cleanSheets) || 0,
      rank: Number(raw[idx]?.rank) || 1,
    }));

    // "Me" rank/points without scanning all members:
    const myMembership = await this.membershipRepo.findOne({
      where: { leagueId: league.id, teamId: myTeam.id },
    });

    const me = !myMembership
      ? null
      : await (async () => {
          const myRow = await this.membershipRepo
            .createQueryBuilder('m')
            .leftJoin(
              FantasyTeamRanking,
              'r',
              'r.teamId = m.teamId AND r.fixtureId = 0',
            )
            .select('COALESCE(r.totalPoints, 0)', 'totalPoints')
            .addSelect('COALESCE(r.goals, 0)', 'goals')
            .addSelect('COALESCE(r.assists, 0)', 'assists')
            .addSelect('COALESCE(r.saves, 0)', 'saves')
            .addSelect('COALESCE(r.yellowCards, 0)', 'yellowCards')
            .addSelect('COALESCE(r.redCards, 0)', 'redCards')
            .addSelect('COALESCE(r.ownGoals, 0)', 'ownGoals')
            .addSelect('COALESCE(r.cleanSheets, 0)', 'cleanSheets')
            .where('m.leagueId = :leagueId', { leagueId: league.id })
            .andWhere('m.teamId = :teamId', { teamId: myTeam.id })
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
          const betterCount = await this.membershipRepo
            .createQueryBuilder('m')
            .leftJoin(
              FantasyTeamRanking,
              'r',
              'r.teamId = m.teamId AND r.fixtureId = 0',
            )
            .where('m.leagueId = :leagueId', { leagueId: league.id })
            .andWhere('COALESCE(r.totalPoints, 0) > :p', { p: myPoints })
            .getCount();

          return {
            teamId: myTeam.id,
            rank: betterCount + 1,
            totalPoints: myPoints,
            goals: Number(myRow?.goals) || 0,
            assists: Number(myRow?.assists) || 0,
            saves: Number(myRow?.saves) || 0,
            yellowCards: Number(myRow?.yellowCards) || 0,
            redCards: Number(myRow?.redCards) || 0,
            ownGoals: Number(myRow?.ownGoals) || 0,
            cleanSheets: Number(myRow?.cleanSheets) || 0,
          };
        })();

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

  async getLeagueInsights(
    user: User,
    leagueId: string,
  ): Promise<LeagueInsightsResponseDto> {
    const { team: myTeam } = await this.fantasyService.getMyTeam(user);

    const league = await this.leagueRepo.findOne({
      where: { id: leagueId },
    });
    if (!league) {
      throw new NotFoundException('League not found');
    }

    const memberships = await this.membershipRepo.find({
      where: { leagueId: league.id },
      relations: ['team'],
      order: { joinedAt: 'ASC' },
    });
    const teamIds = memberships.map((m) => m.teamId);

    const myMembership = memberships.find((m) => m.teamId === myTeam.id) ?? null;

    const latestLockedGw = await this.getLatestLockedGameweek();
    const prevLockedGw = latestLockedGw
      ? await this.getPreviousLockedGameweek(latestLockedGw)
      : null;

    const currentTotals = await this.getTeamTotalsUpToGameweek({
      teamIds,
      gameweekId: latestLockedGw?.id ?? null,
    });
    const prevTotals = prevLockedGw
      ? await this.getTeamTotalsUpToGameweek({
          teamIds,
          gameweekId: prevLockedGw.id,
        })
      : new Map<string, number>();

    const { rankByTeamId: currentRankByTeamId } = this.computeRanksByPoints(
      teamIds,
      currentTotals,
    );
    const { rankByTeamId: prevRankByTeamId } = prevLockedGw
      ? this.computeRanksByPoints(teamIds, prevTotals)
      : { rankByTeamId: new Map<string, number>() };

    const teamById = new Map(
      memberships
        .map((m) => m.team)
        .filter(Boolean)
        .map((t) => [t.id, t]),
    );

    const allRows: LeagueInsightsTableRowDto[] = teamIds.map((teamId) => {
      const team = teamById.get(teamId);
      const rank = currentRankByTeamId.get(teamId) ?? 1;
      const previousRank = prevRankByTeamId.get(teamId) ?? null;

      return {
        teamId,
        teamName: team?.name ?? '',
        teamLogoUrl: team?.logoUrl ?? '',
        rank,
        previousRank,
        positionChange:
          previousRank == null ? null : previousRank - (rank ?? previousRank),
        totalPoints: currentTotals.get(teamId) ?? 0,
        isMe: teamId === myTeam.id,
      };
    });

    allRows.sort((a, b) => a.rank - b.rank || a.teamId.localeCompare(b.teamId));

    const leaderboard = allRows.slice(0, 5);
    const meRow = myMembership
      ? allRows.find((r) => r.teamId === myTeam.id) ?? null
      : null;

    // League-scoped widget cards
    const squadIds = await this.getLockedSquadIdsForTeams(teamIds, latestLockedGw);
    const totalSquads = squadIds.length;

    const squadPlayers = totalSquads
      ? await this.squadPlayerRepo.find({
          where: { squadId: In(squadIds) as any },
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

    const sortTop = (m: Map<number, number>) =>
      [...m.entries()]
        .map(([playerId, value]) => ({ playerId, value }))
        .sort((a, b) => (b.value !== a.value ? b.value - a.value : a.playerId - b.playerId))
        .slice(0, 5);

    const topSelected = sortTop(selectedCounts);
    const topCaptained = sortTop(captainCounts);

    const transfersStart = prevLockedGw?.snapshotDeadlineAt ?? new Date(0);
    const transfersEnd = latestLockedGw?.snapshotDeadlineAt ?? this.getNow();

    const transferRaw = await this.transferRepo
      .createQueryBuilder('t')
      .select('t.playerInId', 'playerId')
      .addSelect('COUNT(t.id)', 'value')
      .where('t.teamId IN (:...teamIds)', { teamIds })
      .andWhere('t.createdAt > :start', { start: transfersStart })
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
      ? await this.pointsRepo
          .createQueryBuilder('p')
          .innerJoin('p.squadPlayer', 'sp')
          .select('sp.playerId', 'playerId')
          .addSelect('SUM(p.totalPoints)', 'value')
          .where('p.teamId IN (:...teamIds)', { teamIds })
          .andWhere('p.gameweekId = :gwId', { gwId: latestLockedGw.id })
          .groupBy('sp.playerId')
          .orderBy('value', 'DESC')
          .addOrderBy('sp.playerId', 'ASC')
          .limit(5)
          .getRawMany<{ playerId: string; value: string }>()
      : [];

    const topPerforming = performerRaw.map((r) => ({
      playerId: parseInt(r.playerId, 10),
      value: parseInt(r.value, 10) || 0,
    }));

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
      leaderboard,
      me: meRow,
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
}

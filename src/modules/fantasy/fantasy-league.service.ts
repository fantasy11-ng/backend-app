import {
  BadRequestException,
  Injectable,
  InternalServerErrorException,
  NotFoundException,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { FantasyLeague } from './entities/fantasy-league.entity';
import { FantasyLeagueMembership } from './entities/fantasy-league-membership.entity';
import { FantasyTeamRanking } from './entities/fantasy-team-ranking.entity';
import { FantasyService } from './fantasy.service';
import { User } from '@/modules/users/entities/user.entity';
import { CreateFantasyLeagueDto } from './dto';
import { ConfigService } from '@nestjs/config';
import { MainConfig } from '@/common/config/main.config';

@Injectable()
export class FantasyLeagueService {
  private readonly leagueMaxParticipants: number;

  constructor(
    private readonly fantasyService: FantasyService,
    private readonly configService: ConfigService<MainConfig>,
    @InjectRepository(FantasyLeague)
    private readonly leagueRepo: Repository<FantasyLeague>,
    @InjectRepository(FantasyLeagueMembership)
    private readonly membershipRepo: Repository<FantasyLeagueMembership>,
    @InjectRepository(FantasyTeamRanking)
    private readonly rankingRepo: Repository<FantasyTeamRanking>,
  ) {
    const fantasyConfig = this.configService.get('fantasy', {
      infer: true,
    });
    this.leagueMaxParticipants = fantasyConfig?.leagueMaxParticipants ?? 200;
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
}

import {
  BadRequestException,
  Injectable,
  InternalServerErrorException,
  NotFoundException,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { In, Repository } from 'typeorm';
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

    const memberships = await this.membershipRepo.find({
      where: { leagueId: league.id },
    });
    if (!memberships.length) {
      return {
        data: [],
        meta: {
          totalItems: 0,
          itemCount: 0,
          itemsPerPage: limit,
          totalPages: 1,
          currentPage: page,
        },
        me: null,
      };
    }

    const teamIds = memberships.map((m) => m.teamId);

    const allRankings = await this.rankingRepo.find({
      where: { fixtureId: 0, teamId: In(teamIds) as any },
      relations: ['team', 'team.owner'],
    });

    if (!allRankings.length) {
      return {
        data: [],
        meta: {
          totalItems: 0,
          itemCount: 0,
          itemsPerPage: limit,
          totalPages: 1,
          currentPage: page,
        },
        me: null,
      };
    }

    allRankings.sort((a, b) => b.totalPoints - a.totalPoints);

    const totalItems = allRankings.length;
    const totalPages = Math.max(1, Math.ceil(totalItems / limit));
    const currentPage = Math.min(Math.max(page, 1), totalPages);
    const startIndex = (currentPage - 1) * limit;
    const endIndex = startIndex + limit;

    const pageRankings = allRankings.slice(startIndex, endIndex);

    const data = pageRankings.map((r, index) => ({
      team: r.team,
      totalPoints: r.totalPoints,
      rank: startIndex + index + 1,
    }));

    const meIndex = allRankings.findIndex((r) => r.teamId === myTeam.id);
    const me =
      meIndex === -1
        ? null
        : {
            teamId: myTeam.id,
            rank: meIndex + 1,
            totalPoints: allRankings[meIndex].totalPoints,
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
}

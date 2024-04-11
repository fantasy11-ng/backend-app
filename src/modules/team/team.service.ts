import { BadRequestException, Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Team } from './entities/team.entity';
import { Repository } from 'typeorm';
import { CreateTeamDto } from './dto/create-team.dto';
import { User } from 'src/users/entities/user.entity';
import { PlayersService } from '../players/players.service';
import { Player } from '../players/entities/player.entity';

@Injectable()
export class TeamService {
  constructor(
    private playersService: PlayersService,
    @InjectRepository(Team) private teamRepo: Repository<Team>,
  ) {}

  async create(user: User, dto: CreateTeamDto) {
    const sqaud = await this.playersService.getPlayersFromIds(
      dto.squad.map((item) => item.id),
    );
    if (!sqaud || sqaud.length < 1) {
      throw new BadRequestException(
        'Invalid squad: Please select squad players to create a team',
      );
    }
    this.validateSquad(sqaud);

    const team = new Team();
    team.logo = dto.logoUrl;
    team.name = dto.name;
    team.user = user;
    team.squad = sqaud;

    await this.teamRepo.insert(team);
    return `Your team ${dto.name} has been successfully created`;
  }

  private validateSquad(players: Player[]) {
    const poolToPlayers: Record<string, Player[]> = {};
    for (const player of players) {
      if (!poolToPlayers[player.pool]) poolToPlayers[player.pool] = [player];
      else poolToPlayers[player.pool].push(player);
    }

    Object.entries(poolToPlayers).map(([key, val]) => {
      if (val.length != 5) {
        throw new BadRequestException(
          `Your sqaud must have 5 players from pool ${key}`,
        );
      }
    });
  }
}

import {
  BadRequestException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { CreatePredictionDto } from './dto/create-prediction.dto';
import { InjectDataSource } from '@nestjs/typeorm';
import { DataSource, In } from 'typeorm';
import { Prediction } from './entities/prediction.entity';
import { User } from '@/modules/users/entities/user.entity';
import { StagesService } from '../stages/stages.service';
import { FootballTeam } from '../team/entities/football-team.entity';

@Injectable()
export class PredictorService {
  constructor(
    private stagesService: StagesService,
    @InjectDataSource() private db: DataSource,
  ) {}

  async create(user: User, dto: CreatePredictionDto) {
    const predictionRepo = this.db.getRepository(Prediction);

    const stage = await this.stagesService.getOne({ id: dto.stageId });
    if (!stage)
      throw new NotFoundException(
        'Error creating prediction: invalid stage id',
      );

    const existingPrediction = await predictionRepo.findOne({
      where: {
        owner: user,
        groupId: dto.groupId,
        stageId: dto.stageId,
      },
    });

    if (existingPrediction) {
      throw new ForbiddenException("You've already submitted this prediction");
    }

    const teams = await this.db.getRepository(FootballTeam).findBy({
      id: In(dto.teams.map((team) => team.id)),
    });

    const winner = teams.find((team) => team.id === dto.winnerId);
    const runnerUp = teams.find((team) => team.id === dto.runnerUpId);
    const teamsWithGroupPosition = teams.map((team) => {
      return {
        ...team,
        index: dto.teams.find((innerTeam) => innerTeam.id === team.id).index,
      };
    });

    if (winner.id !== teams[0].id) {
      throw new BadRequestException('Winner and first ranking team mismatch');
    }
    if (runnerUp.id !== teams[1].id) {
      throw new BadRequestException(
        'Runner Up and second ranking team mismatch',
      );
    }

    return predictionRepo.save({
      owner: user,
      stageId: dto.stageId,
      groupId: dto.groupId,
      winner,
      runnerUp,
      teams: teamsWithGroupPosition,
    });
  }

  async getUserPredictionsForStage(user: User, stageId: number) {
    return this.db.getRepository(Prediction).find({
      where: {
        owner: user,
        stageId,
      },
    });
  }
}

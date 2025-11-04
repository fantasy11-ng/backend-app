import { Body, Controller, Post, Req, UseGuards } from '@nestjs/common';
import { JwtAuthGuard } from '@/modules/auth/guards/jwt-auth.guard';
import { TeamService } from './team.service';
import { SchemaValidator } from 'src/common/validators/schema.validator';
import { CreateTeamDto, createTeamDtoSchema } from './dto/create-team.dto';
import { Request } from 'express';
import { User } from '@/modules/users/entities/user.entity';

@Controller('team')
export class TeamController {
  constructor(private teamService: TeamService) {}

  @UseGuards(JwtAuthGuard)
  @Post('')
  @UseGuards(JwtAuthGuard)
  async createTeam(
    @Req() req: Request,
    @Body(new SchemaValidator(createTeamDtoSchema)) dto: CreateTeamDto,
  ) {
    return this.teamService.create(req.user as User, dto);
  }
}

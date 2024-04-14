import { SchemaValidator } from '@/common/validators/schema.validator';
import {
  Body,
  Controller,
  Get,
  Param,
  Post,
  Req,
  UseGuards,
} from '@nestjs/common';
import {
  CreatePredictionDto,
  createPredictionDtoSchema,
} from './dto/create-prediction.dto';
import { PredictorService } from './predictor.service';
import { Request } from 'express';
import { JwtAuthGuard } from '@/modules/auth/guards/jwt-auth.guard';
import { User } from '@/modules/users/entities/user.entity';

@Controller('predictor')
export class PredictorController {
  constructor(private predictorService: PredictorService) {}

  @Post()
  @UseGuards(JwtAuthGuard)
  createPrediction(
    @Req() req: Request,
    @Body(new SchemaValidator(createPredictionDtoSchema))
    dto: CreatePredictionDto,
  ) {
    return this.predictorService.create(req.user as User, dto);
  }

  @Get('me/:stageId')
  getMyPredictionForStage(
    @Req() req: Request,
    @Param('stageId') stageId: number,
  ) {
    return this.predictorService.getUserPredictionsForStage(
      req.user as User,
      stageId,
    );
  }
}

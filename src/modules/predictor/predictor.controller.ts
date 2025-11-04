import { SchemaValidator } from '@/common/validators/schema.validator';
import {
  Body,
  Controller,
  Get,
  HttpCode,
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
import { PredictorScoringService } from './services/scoring.service';
import {
  ApiBearerAuth,
  ApiBody,
  ApiOkResponse,
  ApiOperation,
  ApiParam,
  ApiTags,
} from '@nestjs/swagger';
import {
  BracketPredictionDto,
  bracketPredictionDtoSchema,
} from './dto/bracket-prediction.dto';
import {
  ThirdPlacedQualifiersDto,
  thirdPlacedQualifiersSchema,
} from './dto/third-placed-qualifiers.dto';
import {
  ThirdPlaceMatchDto,
  thirdPlaceMatchDtoSchema,
} from './dto/third-place-match.dto';

@ApiTags('Predictor')
@Controller('predictor')
export class PredictorController {
  constructor(
    private predictorService: PredictorService,
    private scoringService: PredictorScoringService,
  ) {}

  @Post()
  @ApiBearerAuth()
  @ApiOperation({
    summary: 'Submit group prediction',
    description:
      'Submit winner, runner-up, and ordering per group. Locked after tournament kickoff.',
  })
  @ApiBody({ type: CreatePredictionDto })
  @ApiOkResponse({
    description: 'Prediction created',
    schema: {
      example: {
        id: 10,
        stageId: 123,
        groupId: 1,
        externalSeasonId: 2026,
        winner: { id: 100, name: 'Team A', short: 'A', logo: 'url' },
        runnerUp: { id: 101, name: 'Team B', short: 'B', logo: 'url' },
        teams: [
          { id: 100, index: 0, name: 'Team A', short: 'A', logo: 'url' },
          { id: 101, index: 1, name: 'Team B', short: 'B', logo: 'url' },
          { id: 102, index: 2, name: 'Team C', short: 'C', logo: 'url' },
          { id: 103, index: 3, name: 'Team D', short: 'D', logo: 'url' },
        ],
        createdAt: '2025-01-01T00:00:00.000Z',
        updatedAt: '2025-01-01T00:00:00.000Z',
      },
    },
  })
  @UseGuards(JwtAuthGuard)
  createPrediction(
    @Req() req: Request,
    @Body(new SchemaValidator(createPredictionDtoSchema))
    dto: CreatePredictionDto,
  ) {
    return this.predictorService.create(req.user as User, dto);
  }

  @Get('me/:stageId')
  @ApiBearerAuth()
  @ApiOperation({
    summary: 'Get my predictions for a stage',
    description: 'Returns all predictions for the user within the given stage.',
  })
  @ApiParam({ name: 'stageId', type: Number })
  @ApiOkResponse({
    description: 'List of predictions',
    schema: {
      example: [
        {
          id: 10,
          stageId: 123,
          groupId: 1,
          winner: { id: 100, name: 'Team A', short: 'A', logo: 'url' },
          runnerUp: { id: 101, name: 'Team B', short: 'B', logo: 'url' },
          teams: [
            { id: 100, index: 0, name: 'Team A', short: 'A', logo: 'url' },
            { id: 101, index: 1, name: 'Team B', short: 'B', logo: 'url' },
          ],
        },
      ],
    },
  })
  getMyPredictionForStage(
    @Req() req: Request,
    @Param('stageId') stageId: number,
  ) {
    return this.predictorService.getUserPredictionsForStage(
      req.user as User,
      stageId,
    );
  }

  @Post('bracket/:roundCode')
  @ApiBearerAuth()
  @ApiOperation({
    summary: 'Submit bracket predictions for a round',
    description:
      "Submit winners for the specified round. Round codes: 'r16' | 'qf' | 'sf' | 'final'.",
  })
  @ApiParam({ name: 'roundCode', enum: ['r16', 'qf', 'sf', 'final'] })
  @ApiBody({ type: BracketPredictionDto })
  @ApiOkResponse({
    description: 'Saved bracket predictions',
    schema: {
      example: [
        {
          id: 55,
          externalFixtureId: 9991,
          roundCode: 'r16',
          externalSeasonId: 2026,
          predictedWinner: { id: 200, name: 'Team X', short: 'X', logo: 'url' },
          createdAt: '2025-01-01T00:00:00.000Z',
          updatedAt: '2025-01-01T00:00:00.000Z',
        },
      ],
    },
  })
  @UseGuards(JwtAuthGuard)
  @HttpCode(200)
  predictBracket(
    @Req() req: Request,
    @Param('roundCode') roundCode: string,
    @Body(new SchemaValidator(bracketPredictionDtoSchema))
    dto: BracketPredictionDto,
  ) {
    return this.predictorService.predictBracket(
      req.user as User,
      roundCode,
      dto,
    );
  }

  @Get('groups')
  @ApiBearerAuth()
  @ApiOperation({
    summary: 'Groups with my predictions overlay',
    description:
      "Lists groups/teams with current user's group prediction for each group (if any).",
  })
  @ApiOkResponse({
    description: 'List of groups with myPrediction',
    schema: {
      example: [
        {
          id: 1,
          name: 'Group A',
          teams: [
            { id: 100, name: 'Team A', short: 'A', logo: 'url' },
            { id: 101, name: 'Team B', short: 'B', logo: 'url' },
          ],
          myPrediction: null,
        },
      ],
    },
  })
  @UseGuards(JwtAuthGuard)
  getGroupsWithMine(@Req() req: Request) {
    return this.predictorService.getGroupsWithMine(req.user as User);
  }

  @Get('bracket/:roundCode/seed')
  @ApiBearerAuth()
  @ApiOperation({
    summary: 'Get seeded participants for a round',
    description:
      "Computes participants based on prior user predictions. 'r16' includes pairs for the active competition.",
  })
  @ApiParam({
    name: 'roundCode',
    enum: ['r16', 'qf', 'sf', 'final', 'third-place'],
  })
  @ApiOkResponse({
    description: 'Seeded participants and pairs (if applicable)',
    schema: {
      example: {
        round: 'r16',
        qualified: {
          winners: [100, 110, 120, 130, 140, 150],
          runnersUp: [101, 111, 121, 131, 141, 151],
          thirdQualified: [102, 112, 122, 132],
        },
        participants: [100, 101, 120, 121],
        pairs: [
          { home: 100, away: 101 },
          { home: 120, away: 121 },
        ],
      },
    },
  })
  @UseGuards(JwtAuthGuard)
  getBracketSeed(@Req() req: Request, @Param('roundCode') roundCode: string) {
    return this.predictorService.getBracketSeed(req.user as User, roundCode);
  }

  @Get('me/score')
  @ApiBearerAuth()
  @ApiOperation({
    summary: 'Get my predictor score',
    description:
      'Returns total points and detailed breakdown for group stage and each knockout round based on actual results.',
  })
  @ApiOkResponse({
    description: 'User scoring summary',
    schema: {
      example: {
        total: 42,
        group: {
          total: 12,
          perGroup: [
            { groupId: 1, correctPositions: 3, allCorrect: false, points: 3 },
          ],
        },
        knockout: {
          r16: { total: 8 },
          qf: { total: 9 },
          sf: { total: 8 },
          final: { total: 5 },
          thirdPlace: { total: 0 },
        },
      },
    },
  })
  @UseGuards(JwtAuthGuard)
  getMyScore(@Req() req: Request) {
    const user = req.user as User;
    return this.scoringService.scoreUser(user.id);
  }

  @Get('bracket/:roundCode/me')
  @ApiBearerAuth()
  @ApiOperation({
    summary: 'Get my bracket predictions for a round',
    description: "Reads back the user's submitted winners for the given round.",
  })
  @ApiParam({ name: 'roundCode', enum: ['r16', 'qf', 'sf', 'final'] })
  @ApiOkResponse({
    description: 'List of fixture predictions',
    schema: {
      example: [
        {
          id: 55,
          externalFixtureId: 9991,
          roundCode: 'qf',
          externalSeasonId: 2026,
          predictedWinner: { id: 200, name: 'Team X', short: 'X', logo: 'url' },
        },
      ],
    },
  })
  @UseGuards(JwtAuthGuard)
  getMyBracket(@Req() req: Request, @Param('roundCode') roundCode: string) {
    return this.predictorService.getBracketPredictions(
      req.user as User,
      roundCode,
    );
  }

  @Get('third-placed-qualifiers/me')
  @ApiBearerAuth()
  @ApiOperation({
    summary: 'Get my third-placed ranking',
    description: 'Reads back the saved ordered list of third-placed teams.',
  })
  @ApiOkResponse({
    description: 'Third-placed ranking',
    schema: {
      example: {
        id: 77,
        externalSeasonId: 2026,
        ranking: [102, 112, 122, 132],
      },
    },
  })
  @UseGuards(JwtAuthGuard)
  getMyThirdPlacedRanking(@Req() req: Request) {
    return this.predictorService.getThirdPlacedQualifiers(req.user as User);
  }

  @Get('competition')
  @ApiOperation({
    summary: 'Get active competition type',
    description:
      'Returns competition detection details based on env override or active league name.',
  })
  @ApiOkResponse({
    description: 'Competition metadata',
    schema: {
      example: {
        competition: 'afcon',
        override: 'afcon',
        leagueName: 'AFCON 2025',
        seasonId: 2045,
      },
    },
  })
  getCompetition() {
    return this.predictorService.getCompetition();
  }

  @Post('third-placed-qualifiers')
  @ApiBearerAuth()
  @ApiOperation({
    summary: 'Submit ranked third-placed qualifiers',
    description:
      'Submit an ordered ranking of third-placed teams across groups. Server determines slots based on groups.',
  })
  @ApiBody({ type: ThirdPlacedQualifiersDto })
  @ApiOkResponse({
    description: 'Saved third-placed ranking',
    schema: {
      example: {
        id: 77,
        externalSeasonId: 2026,
        ranking: [102, 112, 122, 132],
      },
    },
  })
  @UseGuards(JwtAuthGuard)
  @HttpCode(200)
  submitThirdPlacedQualifiers(
    @Req() req: Request,
    @Body(new SchemaValidator(thirdPlacedQualifiersSchema))
    dto: ThirdPlacedQualifiersDto,
  ) {
    return this.predictorService.submitThirdPlacedQualifiers(
      req.user as User,
      dto,
    );
  }

  @Post('third-place-match')
  @ApiBearerAuth()
  @ApiOperation({
    summary: 'Submit third-place match winner',
    description: 'Submit the predicted winner for the third-place match.',
  })
  @ApiBody({ type: ThirdPlaceMatchDto })
  @ApiOkResponse({
    description: 'Saved third-place prediction',
    schema: {
      example: {
        id: 99,
        externalFixtureId: 9090,
        externalSeasonId: 2026,
        predictedWinner: { id: 333, name: 'Team Z', short: 'Z', logo: 'url' },
      },
    },
  })
  @UseGuards(JwtAuthGuard)
  @HttpCode(200)
  predictThirdPlace(
    @Req() req: Request,
    @Body(new SchemaValidator(thirdPlaceMatchDtoSchema))
    dto: ThirdPlaceMatchDto,
  ) {
    return this.predictorService.predictThirdPlaceMatch(req.user as User, dto);
  }
}

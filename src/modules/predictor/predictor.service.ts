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
import { SettingsService } from '../settings/settings.service';
import { FixturePrediction } from './entities/fixture-prediction.entity';
import { ThirdPlaceMatchDto } from './dto/third-place-match.dto';
import { ThirdPlaceMatchPrediction } from './entities/third-place-match-prediction.entity';
import { BracketPredictionDto } from './dto/bracket-prediction.dto';
import { ThirdPlacedQualifiersDto } from './dto/third-placed-qualifiers.dto';
import { ThirdPlaceQualifiersInput } from './entities/third-place-qualifiers-input.entity';
import { Group } from '../stages/entities/group.entity';
import { SeedingRulesService } from './services/seeding-rules.service';
import { ConfigService } from '@nestjs/config';
import { MainConfig } from '@/common/config/main.config';

@Injectable()
export class PredictorService {
  constructor(
    private stagesService: StagesService,
    private settingsService: SettingsService,
    private configService: ConfigService<MainConfig>,
    private seedingRules: SeedingRulesService,
    @InjectDataSource() private db: DataSource,
  ) {}

  private async ensureNotLocked() {
    const seasonId = await this.getCurrentSeasonId();
    const startAt = await this.stagesService.getTournamentStartAt(seasonId);
    if (startAt && new Date() >= new Date(startAt)) {
      throw new ForbiddenException(
        'Predictions are locked after tournament kickoff',
      );
    }
  }

  async create(user: User, dto: CreatePredictionDto) {
    await this.ensureNotLocked();
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

  private async getCurrentSeasonId(): Promise<number> {
    const main = await this.settingsService.getMainServiceLeague();
    if (!main || !main.currentSeason) {
      throw new NotFoundException('Active season unavailable');
    }
    return main.currentSeason.serviceId;
  }

  async predictBracket(
    user: User,
    roundCode: string,
    dto: BracketPredictionDto,
  ) {
    await this.ensureNotLocked();
    const seasonId = await this.getCurrentSeasonId();
    const fixturePredRepo = this.db.getRepository(FixturePrediction);
    const teamRepo = this.db.getRepository(FootballTeam);

    const teamIds = dto.predictions.map((p) => p.predictedWinnerTeamId);
    const teams = await teamRepo.findBy({ id: In(teamIds) });

    const predictionsToSave: FixturePrediction[] = [] as any;
    for (const p of dto.predictions) {
      const team = teams.find((t) => t.id === p.predictedWinnerTeamId);
      if (!team) {
        throw new BadRequestException('Invalid team in bracket prediction');
      }

      const existing = await fixturePredRepo.findOne({
        where: {
          owner: user,
          externalFixtureId: p.externalFixtureId,
          roundCode,
          externalSeasonId: seasonId,
        },
      });

      if (existing) {
        existing.predictedWinner = team;
        predictionsToSave.push(existing);
      } else {
        const fp = new FixturePrediction();
        fp.owner = user;
        fp.externalFixtureId = p.externalFixtureId;
        fp.roundCode = roundCode;
        fp.externalSeasonId = seasonId;
        fp.predictedWinner = team;
        predictionsToSave.push(fp);
      }
    }

    return fixturePredRepo.save(predictionsToSave);
  }

  async submitThirdPlacedQualifiers(user: User, dto: ThirdPlacedQualifiersDto) {
    await this.ensureNotLocked();
    const seasonId = await this.getCurrentSeasonId();
    const repo = this.db.getRepository(ThirdPlaceQualifiersInput);

    const existing = await repo.findOne({
      where: { owner: user, externalSeasonId: seasonId },
    });

    if (existing) {
      existing.ranking = dto.ranking;
      return repo.save(existing);
    }

    const input = new ThirdPlaceQualifiersInput();
    input.owner = user;
    input.externalSeasonId = seasonId;
    input.ranking = dto.ranking;
    return repo.save(input);
  }

  async predictThirdPlaceMatch(user: User, dto: ThirdPlaceMatchDto) {
    await this.ensureNotLocked();
    const seasonId = await this.getCurrentSeasonId();
    const repo = this.db.getRepository(ThirdPlaceMatchPrediction);
    const teamRepo = this.db.getRepository(FootballTeam);

    const team = await teamRepo.findOne({
      where: { id: dto.predictedWinnerTeamId },
    });
    if (!team) throw new BadRequestException('Invalid third-place winner team');

    const existing = await repo.findOne({
      where: {
        owner: user,
        externalFixtureId: dto.externalFixtureId,
        externalSeasonId: seasonId,
      },
    });

    if (existing) {
      existing.predictedWinner = team;
      return repo.save(existing);
    }

    const tpm = new ThirdPlaceMatchPrediction();
    tpm.owner = user;
    tpm.externalFixtureId = dto.externalFixtureId;
    tpm.externalSeasonId = seasonId;
    tpm.predictedWinner = team;
    return repo.save(tpm);
  }

  async getGroupsWithMine(user: User) {
    const groupStage = await this.stagesService.getByCode({
      code: 'group-stage',
    });
    if (!groupStage) throw new NotFoundException('Group stage unavailable');

    const [groups, myPredictions] = await Promise.all([
      this.stagesService.getGroups(),
      this.getUserPredictionsForStage(user, groupStage.id),
    ]);

    const groupIdToPrediction = new Map<number, Prediction>();
    for (const p of myPredictions) groupIdToPrediction.set(p.groupId, p);

    return (groups as Group[]).map((g) => ({
      id: g.id,
      name: g.name,
      teams: g.teams,
      myPrediction: groupIdToPrediction.get(g.id) || null,
    }));
  }

  async getBracketSeed(user: User, roundCode: string) {
    const seasonId = await this.getCurrentSeasonId();

    if (roundCode === 'r16') {
      const groupStage = await this.stagesService.getByCode({
        code: 'group-stage',
      });
      if (!groupStage) throw new NotFoundException('Group stage unavailable');

      const [groups, myPredictions, thirdPlaced] = await Promise.all([
        this.stagesService.getGroups(),
        this.getUserPredictionsForStage(user, groupStage.id),
        this.db.getRepository(ThirdPlaceQualifiersInput).findOne({
          where: { owner: user, externalSeasonId: seasonId },
        }),
      ]);

      // Build winners and runners-up per group from user's predictions
      const groupIdToPred = new Map<number, Prediction>();
      for (const p of myPredictions) groupIdToPred.set(p.groupId, p);

      const groupsSorted = (groups as Group[])
        .slice()
        .sort((a, b) => (a.name < b.name ? -1 : a.name > b.name ? 1 : 0));

      const winners: number[] = [];
      const runnersUp: number[] = [];
      const thirdPlacedCandidates: number[] = [];

      for (const g of groupsSorted) {
        const pred = groupIdToPred.get(g.id);
        if (pred) {
          winners.push(pred.winner.id);
          runnersUp.push(pred.runnerUp.id);
          // derive third-place if available from teams order indices
          const ordered = [...pred.teams].sort((a, b) => a.index - b.index);
          if (ordered[2]) thirdPlacedCandidates.push(ordered[2].id);
        }
      }

      const numGroups = groupsSorted.length;
      const autoQualified = numGroups * 2;
      const thirdSlots = Math.max(0, 16 - autoQualified);

      // Take user's submitted ranking to slice thirdPlaced qualifiers
      let thirdQualified: number[] = [];
      if (thirdPlaced?.ranking?.length) {
        const rankingFiltered = thirdPlaced.ranking.filter((t) =>
          thirdPlacedCandidates.includes(t),
        );
        thirdQualified = rankingFiltered.slice(0, thirdSlots);
      } else {
        thirdQualified = thirdPlacedCandidates.slice(0, thirdSlots);
      }

      // Build group letter maps (A..F) from group names
      const groupIdToLetter = new Map<number, string>();
      for (const g of groups as Group[]) {
        const m = (g.name || '').match(/([A-Z])$/);
        if (m) groupIdToLetter.set(g.id, m[1]);
      }
      const winnerMap: Record<string, number> = {};
      const runnerMap: Record<string, number> = {};
      const thirdGroupToTeamId: Record<string, number> = {};
      for (const g of groups as Group[]) {
        const letter = groupIdToLetter.get(g.id);
        if (!letter) continue;
        const pred = groupIdToPred.get(g.id);
        if (pred) {
          winnerMap[letter] = pred.winner.id;
          runnerMap[letter] = pred.runnerUp.id;
          const ordered = [...pred.teams].sort((a, b) => a.index - b.index);
          if (ordered[2]) thirdGroupToTeamId[letter] = ordered[2].id;
        }
      }

      // Determine competition from override or fallback to league name
      const override = this.configService.get('predictor.competitionOverride', {
        infer: true,
      });
      const main = await this.settingsService.getMainServiceLeague();
      const leagueName = (main?.name || '').toLowerCase();
      const type = (override as string)?.toLowerCase() || leagueName;
      const isWorldCup =
        type.includes('world-cup') || type.includes('world cup');
      const isAfcon = type.includes('afcon') || type.includes('africa cup');
      const isUcl = type.includes('ucl') || type.includes('champions league');

      let pairs: { home: number; away: number }[] = [];
      if (isWorldCup) {
        pairs = this.seedingRules.buildWorldCup32Pairs(winnerMap, runnerMap);
      } else if (isAfcon) {
        // Map thirdQualified teamIds back to their group letters, preserving order where possible
        const teamIdToGroupLetter = Object.fromEntries(
          Object.entries(thirdGroupToTeamId).map(([letter, tid]) => [
            String(tid),
            letter,
          ]),
        );
        const thirdLetters = thirdQualified
          .map((t) => teamIdToGroupLetter[String(t)])
          .filter(Boolean) as string[];
        pairs = this.seedingRules.buildAfcon24Pairs(
          winnerMap,
          runnerMap,
          thirdLetters,
          thirdGroupToTeamId,
        );
      } else if (isUcl) {
        pairs = this.seedingRules.buildChampionsLeaguePairs(
          winnerMap,
          runnerMap,
        );
      }

      const participants = pairs.length
        ? pairs.flatMap((p) => [p.home, p.away])
        : [...winners, ...runnersUp, ...thirdQualified];

      return {
        round: 'r16',
        qualified: {
          winners,
          runnersUp,
          thirdQualified,
        },
        participants,
        pairs,
      };
    }

    const fixturePredRepo = this.db.getRepository(FixturePrediction);

    const getWinnersForRound = async (prevRound: string) => {
      const preds = await fixturePredRepo.find({
        where: {
          owner: user,
          roundCode: prevRound,
          externalSeasonId: seasonId,
        },
        relations: ['predictedWinner'],
      });
      return preds.map((p) => p.predictedWinner.id);
    };

    if (roundCode === 'qf') {
      const participants = await getWinnersForRound('r16');
      return { round: 'qf', participants };
    }

    if (roundCode === 'sf') {
      const participants = await getWinnersForRound('qf');
      return { round: 'sf', participants };
    }

    if (roundCode === 'final') {
      const participants = await getWinnersForRound('sf');
      return { round: 'final', participants };
    }

    if (roundCode === 'third-place') {
      const qfWinners = await getWinnersForRound('qf');
      const sfWinners = await getWinnersForRound('sf');
      const losers = qfWinners.filter((t) => !sfWinners.includes(t));
      // In a standard bracket, losers in SF = two teams; here approximation via set difference
      return { round: 'third-place', participants: losers };
    }

    throw new BadRequestException('Unsupported round code');
  }

  async getBracketPredictions(user: User, roundCode: string) {
    const seasonId = await this.getCurrentSeasonId();
    const repo = this.db.getRepository(FixturePrediction);
    return repo.find({
      where: { owner: user, roundCode, externalSeasonId: seasonId },
      relations: ['predictedWinner'],
    });
  }

  async getThirdPlacedQualifiers(user: User) {
    const seasonId = await this.getCurrentSeasonId();
    return this.db.getRepository(ThirdPlaceQualifiersInput).findOne({
      where: { owner: user, externalSeasonId: seasonId },
    });
  }

  async getCompetition() {
    const override = this.configService.get('predictor.competitionOverride', {
      infer: true,
    }) as string;
    const main = await this.settingsService.getMainServiceLeague();
    const leagueName = main?.name || '';
    const type = (override || leagueName).toLowerCase();
    let competition: 'world-cup' | 'afcon' | 'ucl' | 'other' = 'other';
    if (type.includes('world-cup') || type.includes('world cup'))
      competition = 'world-cup';
    else if (type.includes('afcon') || type.includes('africa cup'))
      competition = 'afcon';
    else if (type.includes('ucl') || type.includes('champions league'))
      competition = 'ucl';
    return {
      competition,
      override: override || null,
      leagueName,
      seasonId: main?.currentSeason?.serviceId,
    };
  }
}

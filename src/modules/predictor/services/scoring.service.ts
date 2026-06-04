import { Injectable } from '@nestjs/common';
import { InjectDataSource } from '@nestjs/typeorm';
import { DataSource, In } from 'typeorm';
import { FixturePrediction } from '../entities/fixture-prediction.entity';
import { Prediction } from '../entities/prediction.entity';
import { SettingsService } from '@/modules/settings/settings.service';
import { StagesService } from '@/modules/stages/stages.service';
import { SportmonksStagesService } from '@/common/sportmonks/services/stages.service';
import { SportmonksStandingsService } from '@/common/sportmonks/services/standings.service';
import { FootballTeam } from '@/modules/team/entities/football-team.entity';
import {
  MatchStatus,
  PredictionSummary,
  PredictionSummaryMatch,
  ROUND_LABELS,
  SummaryTeam,
} from '../predictor.types';

const KNOCKOUT_ORDER = ['r32', 'r16', 'qf', 'sf', 'third-place', 'final'];

const KNOCKOUT_POINTS: Record<string, number> = {
  r32: 1,
  r16: 2,
  qf: 3,
  sf: 4,
  'third-place': 5,
  final: 5,
};

const POINTS = {
  groupCorrectPosition: 1,
  groupAllCorrect: 5,
  r32Winner: 1,
  r16Winner: 2,
  qfWinner: 3,
  sfWinner: 4,
  thirdPlaceWinner: 5,
  finalWinner: 5,
};

@Injectable()
export class PredictorScoringService {
  constructor(
    @InjectDataSource() private db: DataSource,
    private settingsService: SettingsService,
    private stagesService: StagesService,
    private smStagesService: SportmonksStagesService,
    private smStandingsService: SportmonksStandingsService,
  ) {}

  private async getSeasonId() {
    const main = await this.settingsService.getMainServiceLeague();
    return main.currentSeason.serviceId;
  }

  async scoreUser(userId: string) {
    const seasonId = await this.getSeasonId();

    const [groupPoints, knockout] = await Promise.all([
      this.scoreGroupStage(userId, seasonId),
      this.scoreKnockouts(userId, seasonId),
    ]);

    const total =
      groupPoints.total +
      (knockout.r32?.total ?? 0) +
      knockout.r16.total +
      knockout.qf.total +
      knockout.sf.total +
      knockout.thirdPlace.total +
      knockout.final.total;

    return { total, group: groupPoints, knockout };
  }

  private async scoreGroupStage(userId: string, seasonId: number) {
    // Fetch user predictions for group stage
    const groupStage = await this.stagesService.getByCode({
      code: 'group-stage',
    });
    const predictions = await this.db.getRepository(Prediction).find({
      where: { owner: { id: userId } as any, stageId: groupStage?.id },
      relations: ['winner', 'runnerUp'],
    });

    // Fetch season standings and build group tables
    const standingsData =
      await this.smStandingsService.getSeasonStandings(seasonId);
    const groupIdToActualOrder = new Map<number, number[]>();
    for (const item of standingsData || []) {
      if (Array.isArray(item.groups)) {
        for (const g of item.groups) {
          const rows = (g.standings || [])
            .slice()
            .sort((a, b) => a.position - b.position);
          const teamIds = rows.map(
            (r: any) => r.participant_id || r.participant?.id,
          );
          if (teamIds.length) groupIdToActualOrder.set(g.id, teamIds);
        }
      }
      if (Array.isArray(item.standings)) {
        const byGroup: Record<number, any[]> = {};
        for (const r of item.standings) {
          const gid = r.group_id || r.group?.id;
          if (!gid) continue;
          (byGroup[gid] ||= []).push(r);
        }
        for (const [gidStr, rows] of Object.entries(byGroup)) {
          const ordered = (rows as any[])
            .slice()
            .sort((a, b) => a.position - b.position);
          const teamIds = ordered.map(
            (r: any) => r.participant_id || r.participant?.id,
          );
          if (teamIds.length) groupIdToActualOrder.set(Number(gidStr), teamIds);
        }
      }
    }

    const perGroup = predictions.map((p) => {
      const predictedOrder = [...p.teams]
        .slice()
        .sort((a, b) => a.index - b.index)
        .map((t) => t.id);
      const actualOrder = groupIdToActualOrder.get(p.groupId) || [];
      const len = Math.min(predictedOrder.length, actualOrder.length);
      let correctPositions = 0;
      for (let i = 0; i < len; i++) {
        if (predictedOrder[i] === actualOrder[i]) correctPositions++;
      }
      const allCorrect =
        len > 0 &&
        correctPositions === len &&
        predictedOrder.length === actualOrder.length;
      const points =
        correctPositions * POINTS.groupCorrectPosition +
        (allCorrect ? POINTS.groupAllCorrect : 0);
      return { groupId: p.groupId, correctPositions, allCorrect, points };
    });

    const total = perGroup.reduce((acc, g) => acc + g.points, 0);
    return { total, perGroup };
  }

  private async scoreKnockouts(userId: string, seasonId: number) {
    // Helper to score a round by intersection of predicted winners with actual winners
    const scoreRound = async (roundCode: string, pointsPerCorrect: number) => {
      const fpRepo = this.db.getRepository(FixturePrediction);
      const predicted = await fpRepo.find({
        where: {
          owner: { id: userId } as any,
          roundCode,
          externalSeasonId: seasonId,
        },
        relations: ['predictedWinner'],
      });
      const predictedTeamIds = predicted.map((p) => p.predictedWinner.id);

      if (!predicted.length) {
        return {
          points: 0,
          correct: [],
          predicted: [],
          actual: [],
        };
      }

      // Get actual winners from SportMonks by stage code & fixture id
      const { data: stages } =
        await this.smStagesService.getSeasonStages(seasonId);

      // Sportmonks uses "knock-out" type for all KO stages; distinguish by name.
      // Supports generic "Round of N" (e.g. "Round of 32", "Round of 16") via regex.
      const matcherByRound: Record<string, (name: string) => boolean> = {
        r32: (name: string) => /round of 32/i.test(name),
        r16: (name: string) => /round of 16/i.test(name),
        qf: (name: string) =>
          /quarter/i.test(name) && /final/i.test(name) && !/semi/i.test(name),
        sf: (name: string) =>
          /semi/i.test(name) && /final/i.test(name) && !/3rd|third/i.test(name),
        final: (name: string) =>
          /final/i.test(name) &&
          !/round of 16/i.test(name) &&
          !/round of 32/i.test(name) &&
          !/quarter/i.test(name) &&
          !/semi/i.test(name) &&
          !/3rd|third/i.test(name),
        'third-place': (name: string) =>
          (/3rd/i.test(name) || /third/i.test(name)) && /place/i.test(name),
      };

      const matcher = matcherByRound[roundCode];
      const serviceStage = stages.find((s) => matcher && matcher(s.name || ''));
      const fixtureWinnerMap = new Map<number, number | null>();
      for (const fx of serviceStage?.fixtures || []) {
        const winner = (fx.participants || []).find((p) => p.meta?.winner);
        fixtureWinnerMap.set(fx.id, winner ? winner.id : null);
      }

      const correct: number[] = [];
      const actualSet = new Set<number>();

      for (const p of predicted) {
        const predictedWinnerId = p.predictedWinner.id;
        const actualWinnerId = fixtureWinnerMap.get(p.externalFixtureId);
        if (actualWinnerId != null) {
          actualSet.add(actualWinnerId);
          if (actualWinnerId === predictedWinnerId) {
            correct.push(predictedWinnerId);
          }
        }
      }

      const points = correct.length * pointsPerCorrect;
      return {
        points,
        correct,
        predicted: predictedTeamIds,
        actual: [...actualSet],
      };
    };

    const [r32, r16, qf, sf, fin, third] = await Promise.all([
      scoreRound('r32', POINTS.r32Winner),
      scoreRound('r16', POINTS.r16Winner),
      scoreRound('qf', POINTS.qfWinner),
      scoreRound('sf', POINTS.sfWinner),
      scoreRound('final', POINTS.finalWinner),
      scoreRound('third-place', POINTS.thirdPlaceWinner),
    ]);

    return {
      r32: { total: r32.points, detail: r32 },
      r16: { total: r16.points, detail: r16 },
      qf: { total: qf.points, detail: qf },
      sf: { total: sf.points, detail: sf },
      final: { total: fin.points, detail: fin },
      thirdPlace: { total: third.points, detail: third },
    };
  }

  /**
   * Builds the full "Predictions Summary" payload backing the Figma summary
   * page: an overall scoreline, a per-stage performance breakdown (accuracy +
   * correct teams), and a per-match breakdown (your pick vs. the actual result
   * with a correct/incorrect/pending status).
   *
   * Reuses the same actual-result matching logic as scoreUser(), so the numbers
   * are consistent with GET /predictor/me/score.
   */
  async getPredictionSummary(userId: string): Promise<PredictionSummary> {
    const seasonId = await this.getSeasonId();

    const groupStage = await this.stagesService.getByCode({
      code: 'group-stage',
    });

    const [
      groupPredictions,
      fixturePredictions,
      standingsData,
      stagesResponse,
    ] = await Promise.all([
      groupStage
        ? this.db.getRepository(Prediction).find({
            where: { owner: { id: userId } as any, stageId: groupStage.id },
            relations: ['winner', 'runnerUp'],
          })
        : Promise.resolve([] as Prediction[]),
      this.db.getRepository(FixturePrediction).find({
        where: { owner: { id: userId } as any, externalSeasonId: seasonId },
        relations: ['predictedWinner'],
        order: { roundCode: 'ASC', externalFixtureId: 'ASC' },
      }),
      this.smStandingsService.getSeasonStandings(seasonId),
      this.smStagesService.getSeasonStages(seasonId),
    ]);

    const stages = stagesResponse?.data ?? [];

    // ---- Group stage breakdown -------------------------------------------
    const groupIdToActualOrder = this.buildGroupActualOrder(standingsData);

    let groupCorrectTeams = 0;
    let groupTotalTeams = 0;
    let groupPoints = 0;
    for (const p of groupPredictions) {
      const predictedOrder = [...p.teams]
        .sort((a, b) => a.index - b.index)
        .map((t) => t.id);
      const actualOrder = groupIdToActualOrder.get(p.groupId) || [];
      const len = Math.min(predictedOrder.length, actualOrder.length);
      let correct = 0;
      for (let i = 0; i < len; i++) {
        if (predictedOrder[i] === actualOrder[i]) correct++;
      }
      const allCorrect =
        len > 0 &&
        correct === len &&
        predictedOrder.length === actualOrder.length;
      groupCorrectTeams += correct;
      groupTotalTeams += predictedOrder.length;
      groupPoints +=
        correct * POINTS.groupCorrectPosition +
        (allCorrect ? POINTS.groupAllCorrect : 0);
    }

    // ---- Knockout breakdown ----------------------------------------------
    // Map of roundCode → fixtureId → actual winner team id
    const winnerMapByRound = new Map<string, Map<number, number | null>>();
    for (const roundCode of KNOCKOUT_ORDER) {
      winnerMapByRound.set(
        roundCode,
        this.buildActualWinnerMap(stages, roundCode),
      );
    }

    const predsByRound = new Map<string, FixturePrediction[]>();
    for (const fp of fixturePredictions) {
      const arr = predsByRound.get(fp.roundCode) ?? [];
      arr.push(fp);
      predsByRound.set(fp.roundCode, arr);
    }

    // Resolve every team referenced (predicted + actual winners) in one query.
    const teamIds = new Set<number>();
    for (const fp of fixturePredictions) {
      if (fp.predictedWinner?.id) teamIds.add(fp.predictedWinner.id);
    }
    for (const wm of winnerMapByRound.values()) {
      for (const tid of wm.values()) if (tid) teamIds.add(tid);
    }
    const teamById = await this.loadTeams([...teamIds]);

    const stagesBreakdown: Array<{
      key: string;
      label: string;
      correctTeams: number;
      totalTeams: number;
      accuracy: number;
      points: number;
    }> = [
      {
        key: 'group-stage',
        label: ROUND_LABELS['group-stage'] ?? 'Group Stage',
        correctTeams: groupCorrectTeams,
        totalTeams: groupTotalTeams,
        accuracy: this.pct(groupCorrectTeams, groupTotalTeams),
        points: groupPoints,
      },
    ];

    const matches: PredictionSummaryMatch[] = [];

    for (const roundCode of KNOCKOUT_ORDER) {
      const preds = predsByRound.get(roundCode) ?? [];
      const winnerMap = winnerMapByRound.get(roundCode)!;
      const label = ROUND_LABELS[roundCode] ?? roundCode.toUpperCase();

      let correctTeams = 0;
      let resolvedTeams = 0;

      for (const fp of preds) {
        const predictedId = fp.predictedWinner?.id ?? null;
        const actualId = winnerMap.get(fp.externalFixtureId) ?? null;
        let status: MatchStatus = 'pending';
        if (actualId != null) {
          resolvedTeams++;
          if (actualId === predictedId) {
            status = 'correct';
            correctTeams++;
          } else {
            status = 'incorrect';
          }
        }

        matches.push({
          round: roundCode,
          label,
          fixtureId: fp.externalFixtureId,
          predictedWinner: predictedId
            ? (teamById.get(predictedId) ?? null)
            : null,
          actualWinner: actualId ? (teamById.get(actualId) ?? null) : null,
          status,
        });
      }

      stagesBreakdown.push({
        key: roundCode,
        label,
        correctTeams,
        totalTeams: preds.length,
        accuracy: this.pct(correctTeams, resolvedTeams),
        points: correctTeams * (KNOCKOUT_POINTS[roundCode] ?? 0),
      });
    }

    const totalPoints = stagesBreakdown.reduce((acc, s) => acc + s.points, 0);
    const totalCorrect = stagesBreakdown.reduce(
      (acc, s) => acc + s.correctTeams,
      0,
    );
    const totalPredicted = stagesBreakdown.reduce(
      (acc, s) => acc + s.totalTeams,
      0,
    );

    return {
      overall: {
        points: totalPoints,
        correctTeams: totalCorrect,
        totalTeams: totalPredicted,
        accuracy: this.pct(totalCorrect, totalPredicted),
      },
      stages: stagesBreakdown,
      matches,
    };
  }

  private pct(numerator: number, denominator: number): number {
    if (!denominator) return 0;
    return Math.round((numerator / denominator) * 100);
  }

  private async loadTeams(ids: number[]): Promise<Map<number, SummaryTeam>> {
    const unique = [...new Set(ids.filter(Boolean))];
    if (!unique.length) return new Map();
    const teams = await this.db
      .getRepository(FootballTeam)
      .findBy({ id: In(unique) });
    return new Map(
      teams.map((t) => [
        t.id,
        { id: t.id, name: t.name, short: t.short, logo: t.logo },
      ]),
    );
  }

  private buildGroupActualOrder(standingsData: any): Map<number, number[]> {
    const groupIdToActualOrder = new Map<number, number[]>();
    for (const item of standingsData || []) {
      if (Array.isArray(item.groups)) {
        for (const g of item.groups) {
          const rows = (g.standings || [])
            .slice()
            .sort((a: any, b: any) => a.position - b.position);
          const teamIds = rows.map(
            (r: any) => r.participant_id || r.participant?.id,
          );
          if (teamIds.length) groupIdToActualOrder.set(g.id, teamIds);
        }
      }
      if (Array.isArray(item.standings)) {
        const byGroup: Record<number, any[]> = {};
        for (const r of item.standings) {
          const gid = r.group_id || r.group?.id;
          if (!gid) continue;
          (byGroup[gid] ||= []).push(r);
        }
        for (const [gidStr, rows] of Object.entries(byGroup)) {
          const ordered = (rows as any[])
            .slice()
            .sort((a, b) => a.position - b.position);
          const teamIds = ordered.map(
            (r: any) => r.participant_id || r.participant?.id,
          );
          if (teamIds.length) groupIdToActualOrder.set(Number(gidStr), teamIds);
        }
      }
    }
    return groupIdToActualOrder;
  }

  private buildActualWinnerMap(
    stages: any[],
    roundCode: string,
  ): Map<number, number | null> {
    const matcherByRound: Record<string, (name: string) => boolean> = {
      r32: (name: string) => /round of 32/i.test(name),
      r16: (name: string) => /round of 16/i.test(name),
      qf: (name: string) =>
        /quarter/i.test(name) && /final/i.test(name) && !/semi/i.test(name),
      sf: (name: string) =>
        /semi/i.test(name) && /final/i.test(name) && !/3rd|third/i.test(name),
      final: (name: string) =>
        /final/i.test(name) &&
        !/round of 16/i.test(name) &&
        !/round of 32/i.test(name) &&
        !/quarter/i.test(name) &&
        !/semi/i.test(name) &&
        !/3rd|third/i.test(name),
      'third-place': (name: string) =>
        (/3rd/i.test(name) || /third/i.test(name)) && /place/i.test(name),
    };

    const matcher = matcherByRound[roundCode];
    const serviceStage = stages.find((s) => matcher && matcher(s.name || ''));
    const fixtureWinnerMap = new Map<number, number | null>();
    for (const fx of serviceStage?.fixtures || []) {
      const winner = (fx.participants || []).find((p: any) => p.meta?.winner);
      fixtureWinnerMap.set(fx.id, winner ? winner.id : null);
    }
    return fixtureWinnerMap;
  }
}

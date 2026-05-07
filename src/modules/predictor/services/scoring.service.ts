import { Injectable } from '@nestjs/common';
import { InjectDataSource } from '@nestjs/typeorm';
import { DataSource } from 'typeorm';
import { FixturePrediction } from '../entities/fixture-prediction.entity';
import { Prediction } from '../entities/prediction.entity';
import { SettingsService } from '@/modules/settings/settings.service';
import { StagesService } from '@/modules/stages/stages.service';
import { SportmonksStagesService } from '@/common/sportmonks/services/stages.service';
import { SportmonksStandingsService } from '@/common/sportmonks/services/standings.service';

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
}

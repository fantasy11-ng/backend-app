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

      // Get actual winners from SportMonks by stage code
      const { data: stages } =
        await this.smStagesService.getSeasonStages(seasonId);
      const stageCodeMap: Record<string, string> = {
        r16: 'round-of-16',
        qf: 'quarter-finals',
        sf: 'semi-finals',
        final: 'final',
        'third-place': 'third-place',
      };
      const serviceStage = stages.find(
        (s) => s.type.code === stageCodeMap[roundCode],
      );
      const actualWinners = new Set<number>();
      for (const fx of serviceStage?.fixtures || []) {
        const winner = (fx.participants || []).find((p) => p.meta?.winner);
        if (winner) actualWinners.add(winner.id);
      }

      const correct = predictedTeamIds.filter((id) => actualWinners.has(id));
      const points = correct.length * pointsPerCorrect;
      return {
        points,
        correct,
        predicted: predictedTeamIds,
        actual: [...actualWinners],
      };
    };

    const [r16, qf, sf, fin, third] = await Promise.all([
      scoreRound('r16', POINTS.r16Winner),
      scoreRound('qf', POINTS.qfWinner),
      scoreRound('sf', POINTS.sfWinner),
      scoreRound('final', POINTS.finalWinner),
      scoreRound('third-place', POINTS.thirdPlaceWinner),
    ]);

    return {
      r16: { total: r16.points, detail: r16 },
      qf: { total: qf.points, detail: qf },
      sf: { total: sf.points, detail: sf },
      final: { total: fin.points, detail: fin },
      thirdPlace: { total: third.points, detail: third },
    };
  }
}

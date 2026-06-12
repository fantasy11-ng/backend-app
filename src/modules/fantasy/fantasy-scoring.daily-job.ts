import { Injectable, Logger, OnModuleDestroy, OnModuleInit } from '@nestjs/common';
import { FantasyScoringService } from './fantasy-scoring.service';

/**
 * Lightweight, dependency-free "cron" that runs scoring once per day.
 *
 * Why not @nestjs/schedule?
 * - This repo currently doesn't include it and sandbox installs can be blocked.
 *
 * Behavior:
 * - Runs at a configured hour/minute (default 03:05) once per day.
 * - Uses an in-memory overlap lock to ensure only one run at a time per process.
 */
@Injectable()
export class FantasyScoringDailyJob implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(FantasyScoringDailyJob.name);
  private timer: NodeJS.Timeout | null = null;
  private isRunning = false;

  constructor(private readonly scoring: FantasyScoringService) {}

  onModuleInit() {
    // Allow disabling in prod/test environments if needed
    if (process.env.FANTASY_SCORING_DAILY_JOB_DISABLED === 'true') {
      this.logger.log('Daily scoring job disabled via env.');
      return;
    }

    this.scheduleNextRun();
  }

  onModuleDestroy() {
    if (this.timer) clearTimeout(this.timer);
    this.timer = null;
  }

  private getScheduleTime(): { hour: number; minute: number } {
    const hour = parseInt(process.env.FANTASY_SCORING_DAILY_HOUR || '3', 10);
    const minute = parseInt(process.env.FANTASY_SCORING_DAILY_MINUTE || '5', 10);
    return {
      hour: Number.isFinite(hour) ? Math.min(Math.max(hour, 0), 23) : 3,
      minute: Number.isFinite(minute) ? Math.min(Math.max(minute, 0), 59) : 5,
    };
  }

  private scheduleNextRun() {
    const now = new Date();
    const { hour, minute } = this.getScheduleTime();

    const next = new Date(now);
    next.setHours(hour, minute, 0, 0);
    if (next.getTime() <= now.getTime()) {
      next.setDate(next.getDate() + 1);
    }

    const delayMs = next.getTime() - now.getTime();

    if (this.timer) clearTimeout(this.timer);
    this.timer = setTimeout(async () => {
      await this.runOnce();
      this.scheduleNextRun(); // schedule following day
    }, delayMs);

    this.logger.log(
      `Next daily scoring run scheduled for ${next.toISOString()} (in ${Math.round(
        delayMs / 1000,
      )}s)`,
    );
  }

  private async runOnce() {
    if (this.isRunning) {
      this.logger.warn('Daily scoring job skipped (previous run still active).');
      return;
    }
    this.isRunning = true;
    try {
      const result = await this.scoring.computeUpToNow({ concurrency: 1 });
      this.logger.log(
        `Daily scoring completed: processed=${result.processed} scored=${result.scored} skippedNoStats=${result.skippedNoStats} errors=${result.errors}`,
      );

      if (result.processed === 0) {
        this.logger.warn(
          'Daily scoring processed 0 fixtures. If a match was played, check FANTASY time config (sim/override) and fixture sync.',
        );
      }

      await this.scoring.refreshSeasonStatsForFixtures(result.scoredFixtureIds);
    } catch (e) {
      this.logger.error(
        `Daily scoring failed: ${(e as Error)?.message ?? e}`,
        (e as Error)?.stack,
      );
    } finally {
      this.isRunning = false;
    }
  }
}



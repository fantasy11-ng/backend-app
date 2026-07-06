import { Injectable, Logger, OnModuleDestroy, OnModuleInit } from '@nestjs/common';
import { StagesService } from './stages.service';

/**
 * Lightweight, dependency-free "cron" that re-syncs stages/groups/teams/fixtures
 * from SportMonks once per day.
 *
 * Why?
 * - Knockout fixtures start as placeholders ("Winner Group A vs Winner Group B").
 *   Once SportMonks resolves the bracket, re-running the sync overwrites each
 *   fixture's participantTeamIds with the real teams. This keeps fixtures fresh
 *   without an admin manually hitting GET /stages/sync.
 *
 * Why not @nestjs/schedule?
 * - This repo currently doesn't include it and sandbox installs can be blocked.
 *   Mirrors the approach in FantasyScoringDailyJob.
 *
 * Behavior:
 * - Runs at a configured hour/minute (default 02:35) once per day.
 * - Uses an in-memory overlap lock to ensure only one run at a time per process.
 */
@Injectable()
export class StagesSyncDailyJob implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(StagesSyncDailyJob.name);
  private timer: NodeJS.Timeout | null = null;
  private isRunning = false;

  constructor(private readonly stages: StagesService) {}

  onModuleInit() {
    if (process.env.STAGES_SYNC_DAILY_JOB_DISABLED === 'true') {
      this.logger.log('Daily stages sync job disabled via env.');
      return;
    }

    this.scheduleNextRun();
  }

  onModuleDestroy() {
    if (this.timer) clearTimeout(this.timer);
    this.timer = null;
  }

  private getScheduleTime(): { hour: number; minute: number } {
    const hour = parseInt(process.env.STAGES_SYNC_DAILY_HOUR || '2', 10);
    const minute = parseInt(process.env.STAGES_SYNC_DAILY_MINUTE || '35', 10);
    return {
      hour: Number.isFinite(hour) ? Math.min(Math.max(hour, 0), 23) : 2,
      minute: Number.isFinite(minute) ? Math.min(Math.max(minute, 0), 59) : 35,
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
      `Next daily stages sync scheduled for ${next.toISOString()} (in ${Math.round(
        delayMs / 1000,
      )}s)`,
    );
  }

  private async runOnce() {
    if (this.isRunning) {
      this.logger.warn('Daily stages sync skipped (previous run still active).');
      return;
    }
    this.isRunning = true;
    try {
      this.logger.log('Daily stages sync starting...');
      const result = await this.stages.sync();
      this.logger.log(
        `Daily stages sync completed.${
          typeof result === 'string' ? ` ${result}` : ''
        }`,
      );
    } catch (e) {
      this.logger.error(
        `Daily stages sync failed: ${(e as Error)?.message ?? e}`,
        (e as Error)?.stack,
      );
    } finally {
      this.isRunning = false;
    }
  }
}

import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { MainConfig } from '@/common/config/main.config';
import { FantasyConfig } from '@/common/config/fantasy.config';

/**
 * Centralized "now" for fantasy logic. Supports:
 * 1. Static override (FANTASY_NOW_OVERRIDE_ISO) - highest priority
 * 2. Simulated time (FANTASY_SIM_ANCHOR_ISO + FANTASY_SIM_SPEED) - advances in real time
 * 3. Real time - default
 *
 * Simulated formula: simulatedNow = anchor + (realNow - realAnchor) × speed
 * Example: speed=2 means 1 real second = 2 simulated seconds (2x faster through tournament)
 */
@Injectable()
export class FantasyTimeService {
  private readonly fantasyConfig: FantasyConfig;
  /** Captured when service is constructed; used as realAnchor when simRealAnchorIso is not set */
  private readonly realAnchorAtStart: number;

  constructor(private readonly configService: ConfigService<MainConfig>) {
    this.fantasyConfig = this.configService.get('fantasy', { infer: true })!;
    this.realAnchorAtStart = Date.now();
  }

  getNow(): Date {
    const { nowOverrideIso, simAnchorIso, simRealAnchorIso, simSpeed } =
      this.fantasyConfig;

    // 1. Static override (highest priority)
    if (nowOverrideIso) {
      const d = new Date(nowOverrideIso);
      if (!Number.isNaN(d.getTime())) return d;
    }

    // 2. Simulated time (anchor + speed)
    if (simAnchorIso && simSpeed != null && simSpeed > 0) {
      const anchor = new Date(simAnchorIso).getTime();
      if (Number.isNaN(anchor)) return new Date();

      const realAnchor = simRealAnchorIso
        ? new Date(simRealAnchorIso).getTime()
        : this.realAnchorAtStart;
      if (Number.isNaN(realAnchor)) return new Date();

      const realNow = Date.now();
      const elapsedMs = realNow - realAnchor;
      const simulatedMs = anchor + elapsedMs * simSpeed;
      return new Date(simulatedMs);
    }

    // 3. Real time
    return new Date();
  }
}

import { Command, CommandRunner, Option } from 'nest-commander';
import { InjectDataSource } from '@nestjs/typeorm';
import { DataSource } from 'typeorm';
import { ConfigService } from '@nestjs/config';
import { MainConfig } from '@/common/config/main.config';
import { FantasySquad } from '@/modules/fantasy/entities/fantasy-squad.entity';
import { FantasySquadPlayer } from '@/modules/fantasy/entities/fantasy-squad-player.entity';
import { parseFormation } from '@/modules/fantasy/fantasy.utils';
import { PositionCode } from '@/modules/fantasy/fantasy.types';

interface RepairSquadStartingOptions {
  dryRun?: boolean;
  teamId?: string;
  includeNonCurrent?: boolean;
}

@Command({
  name: 'fantasy:squads:repair-starting',
  description:
    'Repair squads with incorrect isStarting distribution (e.g. < 11 starters) by rebalancing to match formation.',
})
export class RepairSquadStartingCommand extends CommandRunner {
  constructor(
    @InjectDataSource() private readonly db: DataSource,
    private readonly configService: ConfigService<MainConfig>,
  ) {
    super();
  }

  @Option({
    flags: '--dry-run',
    description: 'Print what would change, without modifying the database',
  })
  parseDryRun(): boolean {
    return true;
  }

  @Option({
    flags: '--teamId <teamId>',
    description: 'Only repair squads for a single fantasy teamId',
  })
  parseTeamId(value: string): string {
    return value;
  }

  @Option({
    flags: '--include-non-current',
    description:
      'Also repair non-current historical squads (default: only isCurrent=true)',
  })
  parseIncludeNonCurrent(): boolean {
    return true;
  }

  private pickPlayersForFormation(
    players: FantasySquadPlayer[],
    formation: string,
    startingXiSize: number,
  ): Set<number> {
    const formationDef = parseFormation(formation);
    const target = formationDef.positions; // GK/DEF/MID/FWD totals sum to 11

    const byPos = new Map<PositionCode, FantasySquadPlayer[]>();
    for (const sp of players) {
      const arr = byPos.get(sp.position) || [];
      arr.push(sp);
      byPos.set(sp.position, arr);
    }

    const selected = new Set<number>();

    // Force captain/vice-captain into starting XI (helps avoid "captain on bench" states).
    const mandatory = players.filter((p) => p.isCaptain || p.isViceCaptain);
    for (const sp of mandatory) selected.add(sp.playerId);

    const selectFrom = (pos: PositionCode, needed: number) => {
      if (needed <= 0) return;
      const pool = (byPos.get(pos) || []).filter(
        (sp) => !selected.has(sp.playerId),
      );
      // Prefer those already marked starting (minimize churn).
      pool.sort((a, b) => Number(b.isStarting) - Number(a.isStarting));
      for (const sp of pool) {
        if ((byPos.get(pos) || []).length === 0) break;
        if (selected.size >= startingXiSize) break;
        if (needed <= 0) break;
        selected.add(sp.playerId);
        needed--;
      }
    };

    // Ensure we don't exceed targets for a position due to mandatory picks.
    const countSelectedPos = (pos: PositionCode) =>
      players.filter((sp) => sp.position === pos && selected.has(sp.playerId))
        .length;

    // If mandatory picks exceed a position target, we keep them and continue; we'll end up > 11.
    // In practice this should be extremely rare.

    // Fill position quotas
    (Object.keys(target) as PositionCode[]).forEach((pos) => {
      const have = countSelectedPos(pos);
      const need = Math.max(0, target[pos] - have);
      selectFrom(pos, need);
    });

    // Final safety: if we still have fewer than 11 starters (e.g. malformed positions),
    // just fill from remaining players preferring existing starters.
    if (selected.size < startingXiSize) {
      const remaining = players
        .filter((sp) => !selected.has(sp.playerId))
        .sort((a, b) => Number(b.isStarting) - Number(a.isStarting));
      for (const sp of remaining) {
        if (selected.size >= startingXiSize) break;
        selected.add(sp.playerId);
      }
    }

    // If we have > 11 (mandatory conflict), demote non-captain/vice first.
    if (selected.size > startingXiSize) {
      const selectedPlayers = players
        .filter((sp) => selected.has(sp.playerId))
        .sort((a, b) => {
          const aPinned = a.isCaptain || a.isViceCaptain;
          const bPinned = b.isCaptain || b.isViceCaptain;
          if (aPinned !== bPinned) return Number(aPinned) - Number(bPinned); // non-pinned first
          return Number(a.isStarting) - Number(b.isStarting); // demote those not previously starting first
        });
      for (const sp of selectedPlayers) {
        if (selected.size <= startingXiSize) break;
        if (sp.isCaptain || sp.isViceCaptain) continue;
        selected.delete(sp.playerId);
      }
    }

    return selected;
  }

  async run(_: string[], options?: RepairSquadStartingOptions): Promise<void> {
    const dryRun = !!options?.dryRun;
    const teamId = options?.teamId ?? null;
    const includeNonCurrent = !!options?.includeNonCurrent;

    const fantasy = this.configService.get('fantasy', { infer: true })!;
    const startingXiSize = fantasy.startingXiSize ?? 11;

    const squadRepo = this.db.getRepository(FantasySquad);
    const spRepo = this.db.getRepository(FantasySquadPlayer);

    const where: any = teamId ? { teamId } : {};
    if (!includeNonCurrent) where.isCurrent = true;

    const squads = await squadRepo.find({
      where,
      relations: ['players', 'team'],
      order: { createdAt: 'DESC' },
    });

    let scanned = 0;
    let changed = 0;
    let skipped = 0;

    for (const squad of squads) {
      scanned++;
      const players = squad.players || [];
      if (!players.length) {
        skipped++;
        // eslint-disable-next-line no-console
        console.log(`[skip] squad=${squad.id} team=${squad.teamId} no players`);
        continue;
      }

      const starters = players.filter((p) => p.isStarting);
      if (starters.length === startingXiSize) continue;

      let selected: Set<number>;
      try {
        selected = this.pickPlayersForFormation(
          players,
          squad.formation,
          startingXiSize,
        );
      } catch (e) {
        skipped++;
        // eslint-disable-next-line no-console
        console.log(
          `[skip] squad=${squad.id} team=${squad.teamId} invalid formation="${squad.formation}"`,
        );
        continue;
      }

      const updates = players
        .filter((sp) => sp.isStarting !== selected.has(sp.playerId))
        .map((sp) => ({ id: sp.id, isStarting: selected.has(sp.playerId) }));

      if (!updates.length) continue;

      changed++;
      // eslint-disable-next-line no-console
      console.log(
        `[fix] squad=${squad.id} team=${squad.teamId} starters ${starters.length} -> ${startingXiSize} updates=${updates.length} dryRun=${dryRun}`,
      );

      if (!dryRun) {
        for (const u of updates) {
          await spRepo.update({ id: u.id }, { isStarting: u.isStarting });
        }
      }
    }

    // eslint-disable-next-line no-console
    console.log(
      `Done. scanned=${scanned} changed=${changed} skipped=${skipped} dryRun=${dryRun}`,
    );
  }
}

import { Player } from '@/modules/players/entities/player.entity';
import { PositionCode } from './fantasy.types';
import { FantasyConfig } from '@/common/config/fantasy.config';

export function mapPlayerToPositionCode(player: Player): PositionCode {
  const code = player.position?.code?.toUpperCase() ?? '';
  const dev = player.position?.developer_name?.toLowerCase() ?? '';

  if (code === 'G' || dev.includes('goalkeeper')) return 'GK';
  if (code === 'D' || dev.includes('defender')) return 'DEF';
  if (code === 'M' || dev.includes('midfielder')) return 'MID';
  if (code === 'F' || dev.includes('forward') || dev.includes('striker'))
    return 'FWD';

  // Fallback: treat unknown as MID to avoid blocking
  return 'MID';
}

export function getFormationDef(config: FantasyConfig, formation: string) {
  const def = config.formations.find((f) => f.code === formation);
  if (!def) throw new Error(`Unsupported formation: ${formation}`);
  return def;
}

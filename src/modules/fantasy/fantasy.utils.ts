import { Player } from '@/modules/players/entities/player.entity';
import { PositionCode } from './fantasy.types';
import { BadRequestException } from '@nestjs/common';

export function mapPlayerToPositionCode(player: Player): PositionCode {
  const rawCode = player.position?.code ?? '';
  const code = rawCode.toString().toUpperCase();
  const dev = player.position?.developer_name?.toLowerCase() ?? '';

  // Goalkeepers
  if (
    code === 'G' ||
    code === 'GK' ||
    code === 'GOALKEEPER' ||
    dev.includes('goalkeeper')
  )
    return 'GK';

  // Defenders
  if (
    code === 'D' ||
    code === 'DF' ||
    code === 'DEF' ||
    code === 'DEFENDER' ||
    dev.includes('defender')
  )
    return 'DEF';

  // Midfielders
  if (
    code === 'M' ||
    code === 'MF' ||
    code === 'MID' ||
    code === 'MIDFIELDER' ||
    dev.includes('midfielder')
  )
    return 'MID';

  // Forwards / Attackers
  if (
    code === 'F' ||
    code === 'FW' ||
    code === 'FWD' ||
    code === 'ATTACKER' ||
    dev.includes('forward') ||
    dev.includes('striker') ||
    dev.includes('attacker')
  )
    return 'FWD';

  // Fallback: treat unknown as MID to avoid blocking
  return 'MID';
}

export function parseFormation(formation: string): {
  code: string;
  positions: Record<PositionCode, number>;
  lines: number[];
} {
  const code = (formation ?? '').trim();
  const parts = code.split('-').filter(Boolean);

  // Support common formats like "4-4-2" and "4-2-3-1"
  if (parts.length < 3 || parts.length > 4) {
    throw new BadRequestException(
      'Invalid formation. Use formats like "4-4-2" or "4-2-3-1".',
    );
  }

  const nums = parts.map((p) => {
    if (!/^\d+$/.test(p)) {
      throw new BadRequestException(
        'Invalid formation. Formation segments must be integers.',
      );
    }
    return Number(p);
  });

  if (nums.some((n) => !Number.isFinite(n) || n <= 0)) {
    throw new BadRequestException(
      'Invalid formation. All formation segments must be positive integers.',
    );
  }

  const outfield = nums.reduce((sum, n) => sum + n, 0);
  if (outfield !== 10) {
    throw new BadRequestException(
      'Invalid formation. Outfield lines must sum to 10 (GK is implied).',
    );
  }

  const defenders = nums[0];
  const forwards = nums[nums.length - 1];
  const midfielders = outfield - defenders - forwards;

  // Practical football constraints (keeps it flexible but sane)
  if (defenders < 3) {
    throw new BadRequestException(
      'Invalid formation. Must have at least 3 defenders.',
    );
  }
  if (forwards < 1) {
    throw new BadRequestException(
      'Invalid formation. Must have at least 1 forward.',
    );
  }
  if (midfielders < 1) {
    throw new BadRequestException(
      'Invalid formation. Must have at least 1 midfielder.',
    );
  }

  return {
    code,
    lines: nums,
    positions: {
      GK: 1,
      DEF: defenders,
      MID: midfielders,
      FWD: forwards,
    },
  };
}

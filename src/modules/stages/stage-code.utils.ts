/**
 * Normalizes a Sportmonks stage into a stable internal stage code.
 *
 * Sportmonks uses "group-stage" for group phases and "knock-out" for ALL
 * knockout phases, so we must distinguish r16, qf, sf, final, third-place
 * (and now round-of-32) by parsing the stage name.
 *
 * Generic "Round of N" stages (e.g. "Round of 32", "Round of 16") are mapped
 * to `round-of-<N>` so new round sizes work without code changes.
 */
export function normalizeStageCode(
  stageTypeCode: string,
  stageName: string,
): string {
  const name = (stageName || '').toLowerCase();

  if (stageTypeCode === 'group-stage') return 'group-stage';

  // Generic "Round of N" (e.g. "Round of 32", "Round of 16")
  const m = name.match(/round\s+of\s+(\d+)/);
  if (m) return `round-of-${Number(m[1])}`;

  if (name.includes('quarter') && name.includes('final')) return 'quarter-finals';
  if (name.includes('semi') && name.includes('final')) return 'semi-finals';
  if ((name.includes('3rd') || name.includes('third')) && name.includes('place'))
    return 'third-place';
  if (name.includes('final')) return 'final';

  return stageTypeCode;
}

/**
 * Returns true for any stage code that represents a knockout round
 * (includes dynamic "round-of-N" codes as well as named KO stages).
 */
export function isKnockoutStageCode(code: string): boolean {
  if (/^round-of-\d+$/.test(code)) return true;
  return (
    code === 'quarter-finals' ||
    code === 'semi-finals' ||
    code === 'final' ||
    code === 'third-place'
  );
}

/**
 * Converts a predictor round code (e.g. "r32", "r16", "qf") to the matching
 * internal stage code stored in the DB.
 *
 * Returns null for unrecognised codes.
 */
export function roundCodeToStageCode(roundCode: string): string | null {
  if (/^r\d+$/.test(roundCode)) return `round-of-${Number(roundCode.slice(1))}`;
  if (roundCode === 'qf') return 'quarter-finals';
  if (roundCode === 'sf') return 'semi-finals';
  if (roundCode === 'final') return 'final';
  if (roundCode === 'third-place') return 'third-place';
  return null;
}

/**
 * Converts an internal stage code (e.g. "round-of-32") back to the short
 * predictor round code used in the API (e.g. "r32").
 *
 * Returns null for non-knockout stages.
 */
export function stageCodeToRoundCode(stageCode: string): string | null {
  const m = stageCode.match(/^round-of-(\d+)$/);
  if (m) return `r${m[1]}`;
  if (stageCode === 'quarter-finals') return 'qf';
  if (stageCode === 'semi-finals') return 'sf';
  if (stageCode === 'final') return 'final';
  if (stageCode === 'third-place') return 'third-place';
  return null;
}

import {
  normalizeStageCode,
  isKnockoutStageCode,
  roundCodeToStageCode,
  stageCodeToRoundCode,
} from './stage-code.utils';

describe('normalizeStageCode', () => {
  it('returns group-stage for group-stage type', () => {
    expect(normalizeStageCode('group-stage', 'Group Stage')).toBe('group-stage');
    expect(normalizeStageCode('group-stage', '')).toBe('group-stage');
  });

  it('returns round-of-32 for "Round of 32" stage name', () => {
    expect(normalizeStageCode('knock-out', 'Round of 32')).toBe('round-of-32');
    expect(normalizeStageCode('knock-out', 'round of 32')).toBe('round-of-32');
    expect(normalizeStageCode('knock-out', 'ROUND OF 32')).toBe('round-of-32');
  });

  it('returns round-of-16 for "Round of 16" stage name', () => {
    expect(normalizeStageCode('knock-out', 'Round of 16')).toBe('round-of-16');
    expect(normalizeStageCode('knock-out', 'Round  of  16')).toBe('round-of-16');
  });

  it('returns quarter-finals for quarterfinal stage names', () => {
    expect(normalizeStageCode('knock-out', 'Quarter-Finals')).toBe('quarter-finals');
    expect(normalizeStageCode('knock-out', 'Quarterfinals')).toBe('quarter-finals');
  });

  it('returns semi-finals for semifinal stage names', () => {
    expect(normalizeStageCode('knock-out', 'Semi-Finals')).toBe('semi-finals');
  });

  it('returns third-place for 3rd place stage names', () => {
    expect(normalizeStageCode('knock-out', '3rd Place')).toBe('third-place');
    expect(normalizeStageCode('knock-out', 'Third Place')).toBe('third-place');
  });

  it('returns final for plain Final', () => {
    expect(normalizeStageCode('knock-out', 'Final')).toBe('final');
  });

  it('falls back to stageTypeCode for unrecognised names', () => {
    expect(normalizeStageCode('knock-out', 'Some Unknown Stage')).toBe('knock-out');
  });
});

describe('isKnockoutStageCode', () => {
  it('returns true for round-of-N patterns', () => {
    expect(isKnockoutStageCode('round-of-32')).toBe(true);
    expect(isKnockoutStageCode('round-of-16')).toBe(true);
    expect(isKnockoutStageCode('round-of-8')).toBe(true);
  });

  it('returns true for named KO stages', () => {
    expect(isKnockoutStageCode('quarter-finals')).toBe(true);
    expect(isKnockoutStageCode('semi-finals')).toBe(true);
    expect(isKnockoutStageCode('final')).toBe(true);
    expect(isKnockoutStageCode('third-place')).toBe(true);
  });

  it('returns false for non-knockout stages', () => {
    expect(isKnockoutStageCode('group-stage')).toBe(false);
    expect(isKnockoutStageCode('knock-out')).toBe(false);
  });
});

describe('roundCodeToStageCode', () => {
  it('converts rN round codes to round-of-N stage codes', () => {
    expect(roundCodeToStageCode('r32')).toBe('round-of-32');
    expect(roundCodeToStageCode('r16')).toBe('round-of-16');
    expect(roundCodeToStageCode('r8')).toBe('round-of-8');
  });

  it('converts named round codes', () => {
    expect(roundCodeToStageCode('qf')).toBe('quarter-finals');
    expect(roundCodeToStageCode('sf')).toBe('semi-finals');
    expect(roundCodeToStageCode('final')).toBe('final');
    expect(roundCodeToStageCode('third-place')).toBe('third-place');
  });

  it('returns null for unknown codes', () => {
    expect(roundCodeToStageCode('unknown')).toBeNull();
    expect(roundCodeToStageCode('')).toBeNull();
  });
});

describe('stageCodeToRoundCode', () => {
  it('converts round-of-N to rN', () => {
    expect(stageCodeToRoundCode('round-of-32')).toBe('r32');
    expect(stageCodeToRoundCode('round-of-16')).toBe('r16');
  });

  it('converts named stage codes', () => {
    expect(stageCodeToRoundCode('quarter-finals')).toBe('qf');
    expect(stageCodeToRoundCode('semi-finals')).toBe('sf');
    expect(stageCodeToRoundCode('final')).toBe('final');
    expect(stageCodeToRoundCode('third-place')).toBe('third-place');
  });

  it('returns null for non-knockout stages', () => {
    expect(stageCodeToRoundCode('group-stage')).toBeNull();
  });
});

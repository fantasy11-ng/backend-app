import {
  calculateOwnershipPercentage,
  calculatePerformanceIndex,
  calculatePriceChange,
  calculateRecentForm,
  PLAYER_INSIGHTS_FORM_LOOKBACK,
  PLAYER_INSIGHTS_MAX_PRICE_CHANGE,
} from './player-insights.metrics';

describe('player insights metrics', () => {
  describe('calculateOwnershipPercentage', () => {
    it('returns a rounded ownership percentage from selected and total teams', () => {
      expect(
        calculateOwnershipPercentage({
          selectedTeams: 19,
          totalTeams: 75,
        }),
      ).toBe(25.33);
    });

    it('returns null when there is no valid team population', () => {
      expect(
        calculateOwnershipPercentage({
          selectedTeams: 3,
          totalTeams: 0,
        }),
      ).toBeNull();
    });

    it('clamps selected teams to the available team population', () => {
      expect(
        calculateOwnershipPercentage({
          selectedTeams: 12,
          totalTeams: 10,
        }),
      ).toBe(100);
    });
  });

  describe('calculatePriceChange', () => {
    it('maps positive transfer demand onto a positive price delta', () => {
      expect(
        calculatePriceChange({
          transferIns: 60,
          transferOuts: 20,
          totalTeams: 400,
        }),
      ).toBe(125000);
    });

    it('maps negative transfer demand symmetrically onto a negative price delta', () => {
      expect(
        calculatePriceChange({
          transferIns: 20,
          transferOuts: 60,
          totalTeams: 400,
        }),
      ).toBe(-125000);
    });

    it('caps extreme demand to avoid oversized spikes', () => {
      expect(
        calculatePriceChange({
          transferIns: 500,
          transferOuts: 0,
          totalTeams: 100,
        }),
      ).toBe(PLAYER_INSIGHTS_MAX_PRICE_CHANGE);
    });

    it('returns null when the team population is unavailable', () => {
      expect(
        calculatePriceChange({
          transferIns: 5,
          transferOuts: 1,
          totalTeams: 0,
        }),
      ).toBeNull();
    });
  });

  describe('calculateRecentForm', () => {
    it('averages fantasy points over the latest relevant fixtures within the default lookback', () => {
      expect(
        calculateRecentForm({
          recentFixtureStats: [
            { fixtureId: 2, fantasyPoints: 4, minutesPlayed: 90 },
            { fixtureId: 6, fantasyPoints: 0, minutesPlayed: 0 },
            { fixtureId: 5, fantasyPoints: 9, minutesPlayed: 90 },
            { fixtureId: 4, fantasyPoints: 6, minutesPlayed: 60 },
            { fixtureId: 1, fantasyPoints: 2, minutesPlayed: 20 },
            { fixtureId: 3, fantasyPoints: 8, minutesPlayed: 75 },
            { fixtureId: 7, fantasyPoints: 11, minutesPlayed: 90 },
          ],
        }),
      ).toBe(8.67); // top 3 by fixtureId (excluding id=6 which has 0min/0pts): ids 7,5,4 → avg(11,9,6)
      expect(PLAYER_INSIGHTS_FORM_LOOKBACK).toBe(3);
    });

    it('returns null when no relevant recent fixtures are available', () => {
      expect(
        calculateRecentForm({
          recentFixtureStats: [
            { fixtureId: 1, fantasyPoints: 0, minutesPlayed: 0 },
            { fixtureId: 2, fantasyPoints: 0, minutesPlayed: 0 },
          ],
        }),
      ).toBeNull();
    });

    it('returns null when lookback is zero or negative', () => {
      expect(
        calculateRecentForm({
          recentFixtureStats: [{ fixtureId: 1, fantasyPoints: 6, minutesPlayed: 90 }],
          lookback: 0,
        }),
      ).toBeNull();
      expect(
        calculateRecentForm({
          recentFixtureStats: [{ fixtureId: 1, fantasyPoints: 6, minutesPlayed: 90 }],
          lookback: -2,
        }),
      ).toBeNull();
    });
  });

  describe('calculatePerformanceIndex', () => {
    it('builds a weighted 0-100 score from recent production, minutes, and season support stats', () => {
      expect(
        calculatePerformanceIndex({
          recentFixtureStats: [
            { fixtureId: 1, fantasyPoints: 7, minutesPlayed: 60 },
            { fixtureId: 2, fantasyPoints: 8, minutesPlayed: 70 },
            { fixtureId: 3, fantasyPoints: 9, minutesPlayed: 75 },
            { fixtureId: 4, fantasyPoints: 10, minutesPlayed: 75 },
            { fixtureId: 5, fantasyPoints: 11, minutesPlayed: 80 },
          ],
          seasonStats: {
            appearances: 10,
            shotsOnTarget: 12,
            keyPasses: 18,
          },
        }),
      ).toBe(72.25);
    });

    it('rebalances the weighted score when only recent fixture stats are available', () => {
      expect(
        calculatePerformanceIndex({
          recentFixtureStats: [
            { fixtureId: 1, fantasyPoints: 6, minutesPlayed: 90 },
            { fixtureId: 2, fantasyPoints: 6, minutesPlayed: 90 },
            { fixtureId: 3, fantasyPoints: 6, minutesPlayed: 90 },
          ],
        }),
      ).toBe(63.33);
    });

    it('returns null when it has no usable performance inputs', () => {
      expect(calculatePerformanceIndex({})).toBeNull();
    });

    it('returns null when lookback is zero or negative', () => {
      const recentFixtureStats = [
        { fixtureId: 1, fantasyPoints: 7, minutesPlayed: 60 },
      ];

      expect(
        calculatePerformanceIndex({
          recentFixtureStats,
          lookback: 0,
        }),
      ).toBeNull();
      expect(
        calculatePerformanceIndex({
          recentFixtureStats,
          lookback: -1,
        }),
      ).toBeNull();
    });
  });
});

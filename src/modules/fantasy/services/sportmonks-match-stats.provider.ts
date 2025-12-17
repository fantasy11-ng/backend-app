import { Injectable } from '@nestjs/common';
import { MatchStatsProvider, PlayerMatchStats } from '../match-stats.provider';
import { SportmonksFixturesService } from '@/common/sportmonks/services/fixtures.service';
import { SportmonksPlayersService } from '@/common/sportmonks/services/players.service';
import { PlayersService } from '@/modules/players/players.service';
import { Player } from '@/modules/players/entities/player.entity';
import { InjectDataSource } from '@nestjs/typeorm';
import { DataSource } from 'typeorm';

@Injectable()
export class SportmonksMatchStatsProvider implements MatchStatsProvider {
  constructor(
    private readonly fixturesService: SportmonksFixturesService,
    private readonly sportmonksPlayersService: SportmonksPlayersService,
    private readonly playersService: PlayersService,
    @InjectDataSource() private readonly db: DataSource,
  ) {}

  async getStatsForFixture(fixtureId: number): Promise<PlayerMatchStats[]> {
    try {
      // Fetch fixture statistics from Sportmonks
      const fixtureStats =
        await this.fixturesService.getFixtureStatistics(fixtureId);

      if (!fixtureStats || fixtureStats.length === 0) {
        return [];
      }

      // Fetch fixture details to get participants and scores for clean sheet calculation
      const fixture = await this.fixturesService.getFixtureById(fixtureId, [
        'participants',
        'scores',
      ]);

      if (!fixture || !fixture.participants) {
        return [];
      }

      // Build a map of participant IDs to goals conceded (opponent's goals scored)
      const participantGoalsConceded = new Map<number, number>();
      const participantIds = fixture.participants.map((p) => p.id);

      // Initialize goals conceded map
      for (const participantId of participantIds) {
        participantGoalsConceded.set(participantId, 0);
      }

      // Calculate goals conceded for each team
      // In a match, team1's goals conceded = team2's goals scored
      // We sum goals from opponent's player statistics
      for (let i = 0; i < fixture.participants.length; i++) {
        const team1 = fixture.participants[i];
        for (let j = i + 1; j < fixture.participants.length; j++) {
          const team2 = fixture.participants[j];

          // Team1's goals conceded = Team2's total goals scored
          const team2Stats = fixtureStats.find(
            (s) => s.participant_id === team2.id,
          );
          if (team2Stats?.statistics) {
            // Sum all goals scored by team2's players
            const team2TotalGoals = team2Stats.statistics.reduce(
              (sum, stat) => sum + (stat.goals || 0),
              0,
            );
            participantGoalsConceded.set(team1.id, team2TotalGoals);
          }

          // Team2's goals conceded = Team1's total goals scored
          const team1Stats = fixtureStats.find(
            (s) => s.participant_id === team1.id,
          );
          if (team1Stats?.statistics) {
            const team1TotalGoals = team1Stats.statistics.reduce(
              (sum, stat) => sum + (stat.goals || 0),
              0,
            );
            participantGoalsConceded.set(team2.id, team1TotalGoals);
          }
        }
      }

      // Get all Sportmonks player IDs from statistics to batch fetch from database
      const sportmonksPlayerIds = new Set<number>();
      for (const teamStats of fixtureStats) {
        if (teamStats.statistics) {
          for (const stat of teamStats.statistics) {
            if (stat.player_id) {
              sportmonksPlayerIds.add(stat.player_id);
            }
          }
        }
      }

      // Fetch players from database using externalId to map Sportmonks player IDs
      const players = await this.db
        .getRepository(Player)
        .createQueryBuilder('player')
        .where('player.externalId IN (:...ids)', {
          ids: Array.from(sportmonksPlayerIds),
        })
        .getMany();

      // Create a map from Sportmonks player ID (externalId) to our Player entity
      const playerMap = new Map<number, Player>();
      for (const player of players) {
        if (player.externalId) {
          playerMap.set(player.externalId, player);
        }
      }

      // If scoring references players we haven't synced yet, fetch + upsert them on-demand.
      const missingIds: number[] = [];
      for (const id of sportmonksPlayerIds) {
        if (!playerMap.has(id)) missingIds.push(id);
      }

      if (missingIds.length) {
        // Avoid hammering upstream; cap per fixture.
        const toFetch = missingIds.slice(0, 60);
        await Promise.all(
          toFetch.map(async (id) => {
            try {
              const smPlayer =
                await this.sportmonksPlayersService.getPlayerById(id);
              await this.playersService.upsertFromSportmonksPlayer({
                sportmonksPlayerId: id,
                player: smPlayer,
              });
            } catch (e) {
              // Best-effort only; we’ll just skip if still missing.
              return;
            }
          }),
        );

        // Reload any newly upserted players into the map
        const reloaded = await this.db
          .getRepository(Player)
          .createQueryBuilder('player')
          .where('player.externalId IN (:...ids)', { ids: toFetch })
          .getMany();
        for (const p of reloaded) {
          if (p.externalId) playerMap.set(p.externalId, p);
        }
      }

      // Determine clean sheets for each team
      // Clean sheet = team conceded 0 goals
      const teamCleanSheets = new Map<number, boolean>();
      for (const participantId of participantIds) {
        const goalsConceded = participantGoalsConceded.get(participantId) || 0;
        teamCleanSheets.set(participantId, goalsConceded === 0);
      }

      // Convert Sportmonks statistics to PlayerMatchStats
      const stats: PlayerMatchStats[] = [];

      for (const teamStats of fixtureStats) {
        const participantId = teamStats.participant_id;
        const hasCleanSheet = teamCleanSheets.get(participantId) || false;

        if (teamStats.statistics) {
          for (const stat of teamStats.statistics) {
            if (!stat.player_id) continue;

            const player = playerMap.get(stat.player_id);
            if (!player) {
              // Skip if we don't have this player in our database
              continue;
            }

            // Extract statistics with defaults
            const minutesPlayed = stat.minutes_played || 0;
            const goals = stat.goals || 0;
            const assists = stat.assists || 0;
            const saves = stat.saves || 0;
            // For team-level goals conceded, use the team's total goals conceded
            // For individual player, this might be 0 in stats, so we use team total
            const teamGoalsConceded =
              participantGoalsConceded.get(participantId) || 0;
            const yellowCards = stat.yellow_cards || 0;
            const redCards = stat.red_cards || 0;
            const ownGoals = stat.own_goals || 0;
            const rating = stat.rating || undefined;
            const penaltyScored = (stat.penalties_scored || 0) > 0;
            const penaltyMissed = (stat.penalties_missed || 0) > 0;
            const freeKickScored = (stat.free_kicks_scored || 0) > 0;

            // Determine clean sheet based on position and team performance
            // Only GK and DEF get clean sheet points
            const isGoalkeeperOrDefender =
              player.position?.code?.toUpperCase() === 'G' ||
              player.position?.code?.toUpperCase() === 'D' ||
              player.position?.developer_name?.toUpperCase() === 'GOALKEEPER' ||
              player.position?.developer_name?.toUpperCase() === 'DEFENDER';

            stats.push({
              playerId: player.id,
              fixtureId,
              minutesPlayed,
              goals,
              assists,
              saves,
              goalsConceded: teamGoalsConceded, // Use team's goals conceded
              yellowCards,
              redCards,
              ownGoals,
              rating,
              cleanSheet: isGoalkeeperOrDefender && hasCleanSheet,
              penaltyScored,
              penaltyMissed,
              freeKickScored,
            });
          }
        }
      }

      return stats;
    } catch (error) {
      console.error(
        `Error fetching match stats for fixture ${fixtureId}:`,
        error,
      );
      return [];
    }
  }
}

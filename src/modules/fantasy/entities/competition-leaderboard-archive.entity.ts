import {
  Column,
  CreateDateColumn,
  Entity,
  PrimaryGeneratedColumn,
} from 'typeorm';

export interface LeaderboardEntry {
  rank: number;
  teamName: string;
  ownerId: string;
  ownerName: string;
  totalPoints: number;
  goals: number;
  assists: number;
  saves: number;
  yellowCards: number;
  redCards: number;
  ownGoals: number;
  cleanSheets: number;
}

@Entity()
export class CompetitionLeaderboardArchive {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column()
  competitionName: string;

  @Column()
  externalSeasonId: number;

  @CreateDateColumn()
  archivedAt: Date;

  @Column('jsonb')
  topEntries: LeaderboardEntry[];
}

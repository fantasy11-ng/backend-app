import {
  Column,
  CreateDateColumn,
  Entity,
  Index,
  OneToMany,
  PrimaryGeneratedColumn,
} from 'typeorm';
import { FantasyTeamRanking } from './fantasy-team-ranking.entity';
import { FantasyPoints } from './fantasy-points.entity';
import { FantasyGameweekPhase } from '../fantasy.types';

@Entity()
@Index(['externalSeasonId', 'code'], { unique: true })
export class FantasyGameweek {
  @PrimaryGeneratedColumn()
  id: number;

  @Column()
  code: string;

  @Column()
  name: string;

  @Column()
  externalSeasonId: number;

  @Column()
  externalRoundId: number;

  @Column()
  firstKickoffAt: Date;

  @Column()
  snapshotDeadlineAt: Date;

  @Column({ type: 'enum', enum: FantasyGameweekPhase })
  phase: FantasyGameweekPhase;

  @Column({ default: false })
  isActive: boolean;

  @OneToMany(() => FantasyTeamRanking, (r) => r.gameweek)
  rankings: FantasyTeamRanking[];

  @OneToMany(() => FantasyPoints, (p) => p.gameweek)
  points: FantasyPoints[];

  @CreateDateColumn()
  createdAt: Date;
}

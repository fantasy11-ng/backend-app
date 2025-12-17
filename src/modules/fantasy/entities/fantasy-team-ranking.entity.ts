import {
  Column,
  CreateDateColumn,
  Entity,
  Index,
  JoinColumn,
  ManyToOne,
  PrimaryGeneratedColumn,
} from 'typeorm';
import { FantasyTeam } from './fantasy-team.entity';
import { FantasyGameweek } from './fantasy-gameweek.entity';

@Entity()
@Index(['fixtureId', 'totalPoints'])
@Index(['gameweekId', 'totalPoints'])
export class FantasyTeamRanking {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @ManyToOne(() => FantasyTeam, (team) => team.rankings, {
    onDelete: 'CASCADE',
  })
  @JoinColumn({ name: 'teamId' })
  team: FantasyTeam;

  @Column()
  teamId: string;

  @Column()
  fixtureId: number;

  @ManyToOne(() => FantasyGameweek, (gw) => gw.rankings, {
    onDelete: 'SET NULL',
    nullable: true,
  })
  @JoinColumn({ name: 'gameweekId' })
  gameweek?: FantasyGameweek | null;

  @Column({ nullable: true })
  gameweekId?: number | null;

  @Column({ type: 'int' })
  totalPoints: number;

  // Aggregated raw stats (team-level) for tie-breakers / display
  @Column({ type: 'int', default: 0 })
  goals: number;

  @Column({ type: 'int', default: 0 })
  assists: number;

  @Column({ type: 'int', default: 0 })
  saves: number;

  @Column({ type: 'int', default: 0 })
  yellowCards: number;

  @Column({ type: 'int', default: 0 })
  redCards: number;

  @Column({ type: 'int', default: 0 })
  ownGoals: number;

  // Count of fixtures with a clean sheet (0 or 1 for fixture rows)
  @Column({ type: 'int', default: 0 })
  cleanSheets: number;

  @Column({ type: 'int' })
  rank: number;

  @CreateDateColumn()
  createdAt: Date;
}

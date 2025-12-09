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

  @Column({ type: 'int' })
  rank: number;

  @CreateDateColumn()
  createdAt: Date;
}

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
import { FantasyBoostType } from '../fantasy.types';

@Entity()
@Index(['teamId', 'gameweekId'], { unique: true })
export class FantasyBoost {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @ManyToOne(() => FantasyTeam, {
    onDelete: 'CASCADE',
  })
  @JoinColumn({ name: 'teamId' })
  team: FantasyTeam;

  @Column()
  teamId: string;

  @ManyToOne(() => FantasyGameweek, {
    onDelete: 'CASCADE',
  })
  @JoinColumn({ name: 'gameweekId' })
  gameweek: FantasyGameweek;

  @Column()
  gameweekId: number;

  @Column({ type: 'enum', enum: FantasyBoostType })
  type: FantasyBoostType;

  @CreateDateColumn()
  createdAt: Date;
}

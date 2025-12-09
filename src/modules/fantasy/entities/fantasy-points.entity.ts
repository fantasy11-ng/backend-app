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
import { FantasySquadPlayer } from './fantasy-squad-player.entity';
import { FantasyGameweek } from './fantasy-gameweek.entity';

@Entity()
@Index(['teamId', 'fixtureId'])
@Index(['teamId', 'gameweekId'])
export class FantasyPoints {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @ManyToOne(() => FantasyTeam, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'teamId' })
  team: FantasyTeam;

  @Column()
  teamId: string;

  @ManyToOne(() => FantasySquadPlayer, { eager: true })
  @JoinColumn({ name: 'squadPlayerId' })
  squadPlayer: FantasySquadPlayer;

  @Column()
  squadPlayerId: string;

  @Column()
  fixtureId: number;

  @ManyToOne(() => FantasyGameweek, (gw) => gw.points, {
    onDelete: 'SET NULL',
    nullable: true,
  })
  @JoinColumn({ name: 'gameweekId' })
  gameweek?: FantasyGameweek | null;

  @Column({ nullable: true })
  gameweekId?: number | null;

  // Raw stats
  @Column({ default: 0 })
  minutesPlayed: number;

  @Column({ default: 0 })
  goals: number;

  @Column({ default: 0 })
  assists: number;

  @Column({ default: 0 })
  saves: number;

  @Column({ default: 0 })
  goalsConceded: number;

  @Column({ default: 0 })
  yellowCards: number;

  @Column({ default: 0 })
  redCards: number;

  @Column({ default: 0 })
  ownGoals: number;

  @Column({ type: 'float', nullable: true })
  rating?: number | null;

  @Column({ default: false })
  cleanSheet: boolean;

  @Column({ default: false })
  penaltyScored: boolean;

  @Column({ default: false })
  penaltyMissed: boolean;

  @Column({ default: false })
  freeKickScored: boolean;

  // Computed points
  @Column({ default: 0 })
  basePoints: number;

  @Column({ default: 0 })
  bonusPoints: number;

  @Column({ default: 0 })
  rolePoints: number;

  @Column({ default: 0 })
  totalPoints: number;

  @CreateDateColumn()
  createdAt: Date;
}

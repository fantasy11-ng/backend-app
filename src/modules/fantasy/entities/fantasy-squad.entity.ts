import {
  Column,
  CreateDateColumn,
  Entity,
  Index,
  JoinColumn,
  ManyToOne,
  OneToMany,
  PrimaryGeneratedColumn,
} from 'typeorm';
import { FantasyTeam } from './fantasy-team.entity';
import { FantasySquadPlayer } from './fantasy-squad-player.entity';
import { FantasyGameweek } from './fantasy-gameweek.entity';

@Entity()
@Index(['teamId', 'gameweekId'], {
  unique: true,
  where: '"isLocked" = false AND "gameweekId" IS NOT NULL',
})
export class FantasySquad {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @ManyToOne(() => FantasyTeam, (team) => team.squads)
  @JoinColumn({ name: 'teamId' })
  team: FantasyTeam;

  @Column()
  teamId: string;

  @Column({ type: 'varchar' })
  formation: string;

  /**
   * The gameweek this squad applies to (draft until locked).
   * Once locked, all fixtures in this gameweek use this frozen snapshot.
   */
  @ManyToOne(() => FantasyGameweek, { nullable: true })
  @JoinColumn({ name: 'gameweekId' })
  gameweek?: FantasyGameweek | null;

  @Column({ nullable: true })
  gameweekId?: number | null;

  @Column({ default: false })
  isLocked: boolean;

  @Column({ type: 'timestamptz', nullable: true })
  lockedAt?: Date | null;

  @Column({ default: true })
  isCurrent: boolean;

  // Optionally link to gameweek/fixture range later
  @Column({ nullable: true })
  fromFixtureId?: number;

  @Column({ nullable: true })
  toFixtureId?: number;

  @OneToMany(() => FantasySquadPlayer, (sp) => sp.squad, {
    cascade: true,
  })
  players: FantasySquadPlayer[];

  @CreateDateColumn()
  createdAt: Date;
}

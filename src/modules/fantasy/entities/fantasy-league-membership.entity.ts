import {
  Column,
  CreateDateColumn,
  Entity,
  Index,
  JoinColumn,
  ManyToOne,
  PrimaryGeneratedColumn,
} from 'typeorm';
import { FantasyLeague } from './fantasy-league.entity';
import { FantasyTeam } from './fantasy-team.entity';

@Entity()
@Index(['leagueId', 'teamId'], { unique: true })
export class FantasyLeagueMembership {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @ManyToOne(() => FantasyLeague, (league) => league.memberships, {
    onDelete: 'CASCADE',
  })
  @JoinColumn({ name: 'leagueId' })
  league: FantasyLeague;

  @Column()
  leagueId: string;

  @ManyToOne(() => FantasyTeam, {
    onDelete: 'CASCADE',
  })
  @JoinColumn({ name: 'teamId' })
  team: FantasyTeam;

  @Column()
  teamId: string;

  @CreateDateColumn()
  joinedAt: Date;
}



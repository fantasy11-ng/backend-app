import {
  Column,
  CreateDateColumn,
  Entity,
  JoinColumn,
  ManyToOne,
  OneToMany,
  PrimaryGeneratedColumn,
} from 'typeorm';
import { FantasyTeam } from './fantasy-team.entity';
import { FantasySquadPlayer } from './fantasy-squad-player.entity';
import { FormationCode } from '@/common/config/fantasy.config';

@Entity()
export class FantasySquad {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @ManyToOne(() => FantasyTeam, (team) => team.squads)
  @JoinColumn({ name: 'teamId' })
  team: FantasyTeam;

  @Column()
  teamId: string;

  @Column({ type: 'varchar' })
  formation: FormationCode;

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

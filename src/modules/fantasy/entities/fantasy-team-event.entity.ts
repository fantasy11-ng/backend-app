import {
  Column,
  CreateDateColumn,
  Entity,
  JoinColumn,
  ManyToOne,
  PrimaryGeneratedColumn,
} from 'typeorm';
import { FantasyTeam } from './fantasy-team.entity';
import { FantasyEventType } from '@/modules/fantasy/fantasy.types';

@Entity()
export class FantasyTeamEvent {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @ManyToOne(() => FantasyTeam, (team) => team.events, {
    onDelete: 'CASCADE',
  })
  @JoinColumn({ name: 'teamId' })
  team: FantasyTeam;

  @Column()
  teamId: string;

  @Column({ type: 'enum', enum: FantasyEventType })
  type: FantasyEventType;

  @Column({ type: 'jsonb', nullable: true })
  payload?: unknown;

  @Column({ nullable: true })
  fixtureId?: number;

  @Column({ nullable: true })
  userId?: string;

  @CreateDateColumn()
  createdAt: Date;
}

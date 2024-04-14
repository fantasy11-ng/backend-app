import { FootballTeam } from '@/modules/team/entities/football-team.entity';
import { User } from '@/modules/users/entities/user.entity';
import {
  Column,
  Entity,
  JoinColumn,
  ManyToOne,
  PrimaryGeneratedColumn,
} from 'typeorm';

@Entity()
export class Prediction {
  @PrimaryGeneratedColumn()
  id: number;
  @Column({ nullable: true })
  externalFixtureId?: number;

  @ManyToOne(() => User)
  @JoinColumn()
  owner: User;

  @Column()
  stageId: number;
  @Column()
  groupId: number;

  @Column('jsonb')
  teams: {
    name: string;
    short: string;
    logo: string;
    id: number;
    index: number;
  }[];

  @ManyToOne(() => FootballTeam)
  winner: FootballTeam;
  @ManyToOne(() => FootballTeam)
  runnerUp: FootballTeam;
}

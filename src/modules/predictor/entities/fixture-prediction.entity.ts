import { User } from '@/modules/users/entities/user.entity';
import { FootballTeam } from '@/modules/team/entities/football-team.entity';
import {
  Column,
  CreateDateColumn,
  Entity,
  JoinColumn,
  ManyToOne,
  PrimaryGeneratedColumn,
  UpdateDateColumn,
} from 'typeorm';

@Entity()
export class FixturePrediction {
  @PrimaryGeneratedColumn()
  id: number;

  @ManyToOne(() => User)
  @JoinColumn()
  owner: User;

  @Column()
  externalFixtureId: number;
  @Column()
  roundCode: string; // r16, qf, sf, final
  @Column({ nullable: true })
  externalSeasonId?: number;

  @ManyToOne(() => FootballTeam)
  predictedWinner: FootballTeam;

  @CreateDateColumn()
  createdAt: Date;
  @UpdateDateColumn()
  updatedAt: Date;
}

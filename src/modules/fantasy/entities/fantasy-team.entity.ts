import {
  Column,
  CreateDateColumn,
  Entity,
  Index,
  JoinColumn,
  ManyToOne,
  OneToMany,
  PrimaryGeneratedColumn,
  UpdateDateColumn,
} from 'typeorm';
import { User } from '@/modules/users/entities/user.entity';
import { FantasySquad } from './fantasy-squad.entity';
import { FantasyTransfer } from './fantasy-transfer.entity';
import { FantasyTeamEvent } from './fantasy-team-event.entity';
import { FantasyTeamRanking } from './fantasy-team-ranking.entity';

@Entity()
@Index(['ownerId'], { unique: true })
export class FantasyTeam {
  private static readonly bigintNumberTransformer = {
    to: (value: number | null | undefined) => value,
    from: (value: string | number | null) =>
      value == null ? value : Number(value),
  };

  @PrimaryGeneratedColumn('uuid')
  id: string;

  @ManyToOne(() => User, { eager: true })
  @JoinColumn({ name: 'ownerId' })
  owner: User;

  @Column()
  ownerId: string;

  @Column()
  name: string;

  @Column()
  logoUrl: string;

  @Column({
    type: 'bigint',
    transformer: FantasyTeam.bigintNumberTransformer,
  })
  budgetTotal: number;

  @Column({
    type: 'bigint',
    transformer: FantasyTeam.bigintNumberTransformer,
  })
  budgetRemaining: number;

  @Column({ nullable: true })
  seasonId?: string;

  @OneToMany(() => FantasySquad, (squad) => squad.team)
  squads: FantasySquad[];

  @OneToMany(() => FantasyTransfer, (t) => t.team)
  transfers: FantasyTransfer[];

  @OneToMany(() => FantasyTeamEvent, (e) => e.team)
  events: FantasyTeamEvent[];

  @OneToMany(() => FantasyTeamRanking, (r) => r.team)
  rankings: FantasyTeamRanking[];

  @CreateDateColumn()
  createdAt: Date;

  @UpdateDateColumn()
  updatedAt: Date;
}
